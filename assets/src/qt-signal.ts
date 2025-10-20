/* Qt 风格 Signal/Slot for TypeScript - ES5 兼容版本（WeakRef与 FinalizationRegistry 移除） */

export interface SlotOptions {
    once?: boolean;      // 自动断开（只调用一次）
    queued?: boolean;    // 异步调用（类似 Qt::QueuedConnection）
}

let _nextId = 1;

export class Connection {
    private _disconnect?: () => void;
    readonly id: number;
    constructor(id: number, disconnect: () => void) {
        this.id = id;
        this._disconnect = disconnect;
    }
    disconnect() {
        if (this._disconnect) {
            this._disconnect();
            this._disconnect = undefined;
        }
    }
    get connected() { return !!this._disconnect; }
}

type SlotFunc<T extends (...args: any[]) => void> = T;

interface Slot<T extends (...args: any[]) => void> {
    id: number;
    callback: SlotFunc<T>;
    target?: any;
    once: boolean;
    queued: boolean;
}

export class Signal<T extends (...args: any[]) => void> {

    private _slots = new Map<number, Slot<T>>();
    private _signalName: string;

    constructor(name: string = '') {
        this._signalName = name;
    }

    connect(callback: SlotFunc<T>, target?: object, options?: SlotOptions): Connection {
        const id = _nextId++;
        const once = !!(options && options.once);
        const queued = !!(options && options.queued);
        const slot: Slot<T> = { id: id, callback: callback, target: target, once: once, queued: queued };
        this._slots.set(id, slot);
        const disconnect = () => {
            this._slots.delete(id);
        };
        return new Connection(id, disconnect);
    }

    disconnect(fnOrTargetOrId?: SlotFunc<T> | object | number) {
        if (fnOrTargetOrId === undefined) {
            this._slots.clear();
            return;
        }
        if (typeof fnOrTargetOrId === 'number') {
            this._slots.delete(fnOrTargetOrId);
            return;
        }
        for (const [id, slot] of this._slots.entries()) {
            if (typeof fnOrTargetOrId === 'function' && slot.callback === fnOrTargetOrId) {
                this._slots.delete(id);
            } else if (typeof fnOrTargetOrId === 'object' && slot.target === fnOrTargetOrId) {
                this._slots.delete(id);
            }
        }
    }

    emit(...args: Parameters<T>) {
        // snapshot for safe iteration
        let snapshot = [...this._slots.entries()]; // Array.from(this._slots.entries());
        for (const [id, slot] of snapshot) {
            // 检查槽是否仍然存在（可能在处理过程中被移除）
            if (!this._slots.has(id)) continue;
            // 立即处理一次性槽的移除
            if (slot.once) {
                this._slots.delete(id);
            }
            // 执行回调的函数
            const executeCallback = () => {
                try {
                    if (slot.target) {
                        slot.callback.apply(slot.target, args);
                    } else {
                        slot.callback(...args);
                    }
                } catch (e) {
                    // 捕获错误但不影响其他槽的执行
                    setTimeout(() => {
                        console.error(`Error in slot function for signal ${this._signalName || 'unnamed'}:`, e);
                        // 在实际应用中，你可能需要更复杂的错误处理策略
                    }, 0);
                }
            };
            // 根据配置决定同步或异步执行
            if (slot.queued) {
                setTimeout(executeCallback, 0);
            } else {
                executeCallback();
            }
        }
    }

    async emitAsync(...args: Parameters<T>): Promise<void> {
        // 创建快照
        const snapshot = [...this._slots.entries()]; // Array.from(this._slots.entries());
        // 收集所有异步操作的Promise
        const promises: Promise<void>[] = [];
        for (const [id, slot] of snapshot) {
            if (!this._slots.has(id)) continue;
            if (slot.once) {
                this._slots.delete(id);
            }
            // 为每个槽创建一个Promise
            const slotPromise = new Promise<void>((resolve) => {
                const execute = () => {
                    try {
                        if (slot.target) {
                            slot.callback.apply(slot.target, args);
                        } else {
                            slot.callback(...args);
                        }
                    } catch (e) {
                        console.error('Signal callback error:', e);
                    } finally {
                        resolve();
                    }
                };
                if (slot.queued) {
                    setTimeout(execute, 0);
                } else {
                    execute();
                }
            });
            promises.push(slotPromise);
        }
        // 等待所有槽执行完成
        await Promise.all(promises);
    }

    get hasSlots() { return this._slots.size > 0; }

    get slotCount() { return this._slots.size; }

    forwardTo<T extends (...args: any[]) => void>(other: Signal<T>, options?: SlotOptions) {
        const forwarder = (...args: Parameters<T>) => {
            other.emit.apply(other, args as any);
        };
        return this.connect(forwarder as any, undefined, options);
    }
}

export function signal() {
    return function (target: any, prop: string) {
        const instance = new Signal(prop);
        Object.defineProperty(target, prop, {
            enumerable: true,
            configurable: true,
            get() { return instance; }
        });
    };
}