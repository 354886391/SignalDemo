// 定义槽函数选项接口
export interface SlotOptions {
    once?: boolean;      // 自动断开（只调用一次）
    queued?: boolean;    // 异步调用（类似 Qt::QueuedConnection）
}

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

// 定义槽函数类型
type SlotFunc<T extends (...args: any[]) => void> = T;

// 定义槽函数项接口
interface Slot<T extends (...args: any[]) => void> {
    id: number;
    callback: SlotFunc<T>;
    target: any;
    once: boolean;
    queued: boolean;
}

// 槽ID计数器
let _nextId: number = 1;

export class Signal {

    // 使用Map存储每个信号名对应的所有槽函数
    private static _slots = new Map<string, Slot<any>[]>();

    /**
     * 触发信号
     * @param signal 信号名或信号函数引用
     * @param args 传递给槽函数的参数
     */
    static emit<T extends (...args: any[]) => void>(signal: T | string, ...args: Parameters<T>): void {
        // 确定信号名称
        let signalName = this.getName(signal);

        // 获取该信号对应的所有槽函数
        const slots = this._slots.get(signalName);
        if (!slots || slots.length === 0) {
            return;
        }

        // 创建一个副本，以避免在触发过程中修改列表
        const slotsSnapshot = [...slots];

        // 依次调用每个槽函数
        for (const slot of slotsSnapshot) {
            if (slot.once) {
                // 立即处理一次性槽函数的移除
                this.disconnectById(signalName, slot.id);
            }
            if (slot.queued) {
                // 异步调用（队列连接）
                setTimeout(() => {
                    this.executeSlot(slot, args);
                }, 0);
            } else {
                // 同步调用
                this.executeSlot(slot, args);
            }
        }
    }

    /**
     * 连接信号和槽函数
     * @param signal 信号名或信号函数引用
     * @param slotFunc 槽函数引用
     * @param target 槽函数目标对象
     * @param options 连接选项
     */
    static connect<T extends (...args: any[]) => void>(signal: T | string, slotFunc: SlotFunc<T>, target?: any, options?: SlotOptions): Connection {
        // 确定信号名称
        const signalName = this.getName(signal);
        // 绑定目标对象到回调函数
        const boundCallback = target ? slotFunc.bind(target) : slotFunc;
        const opts = {
            once: !!(options && options.once),
            queued: !!(options && options.queued)
        };
        // 使用指定的信号名连接槽函数
        return this.addSlot(signalName, boundCallback, target || null, opts);
    }

    /**
     * 断开信号和槽函数的连接
     * @param signal 信号名或信号函数引用
     * @param slotFunc 槽函数引用
     * @param target 槽函数目标对象
     */
    static disconnect<T extends (...args: any[]) => void>(signal: T | string, slotFunc: SlotFunc<T>, target?: any): void {
        // 确定信号名称
        const signalName = this.getName(signal);

        const slots = this._slots.get(signalName);
        if (!slots) return;

        // 过滤掉匹配的槽函数
        const updatedSlots = slots.filter(slot => {
            // 保留不匹配的槽函数
            return slot.callback !== slotFunc || (target && slot.target !== target);
        });

        // 更新信号映射
        if (updatedSlots.length > 0) {
            this._slots.set(signalName, updatedSlots);
        } else {
            this._slots.delete(signalName);
        }
    }

    static disconnectById(signalName: string, id: number): void {
        const slots = this._slots.get(signalName);
        if (!slots) return;

        // 过滤掉匹配的槽函数
        const updatedSlots = slots.filter(slot => slot.id !== id);

        if (updatedSlots.length > 0) {
            this._slots.set(signalName, updatedSlots);
        } else {
            this._slots.delete(signalName);
        }
    }

    /**
     * 添加槽函数的辅助方法
     * @param signalName 信号名称
     * @param callback 槽函数回调
     * @param target 槽函数目标对象
     * @param options 连接选项
     */
    private static addSlot<T extends (...args: any[]) => void>(signalName: string, callback: SlotFunc<T>, target: any, options?: SlotOptions): Connection {
        if (!this._slots.has(signalName)) {
            this._slots.set(signalName, []);
        }
        // 增加ID并创建槽函数
        const id = ++_nextId;
        // 添加槽函数到信号映射
        const slots = this._slots.get(signalName)!;
        slots.push({
            id: id,
            callback: callback,
            target: target,
            once: options?.once || false,
            queued: options?.queued || false
        });
        const disconnect = () => {
            this.disconnect(signalName, callback, target);
        };
        return new Connection(id, disconnect);
    }

    private static executeSlot<T extends (...args: any[]) => void>(slot: Slot<T>, args: Parameters<T>): void {
        try {
            if (slot.target) {
                slot.callback.apply(slot.target, args);
            } else {
                slot.callback(...args);
            }
        } catch (error) {
            console.error(`Error in slot function for signal ${slot['signalName'] || 'unnamed'}:`, error);
        }
    }

    private static getName<T extends (...args: any[]) => void>(signal: T | string): string {
        let signalName: string;
        if (typeof signal === 'function') {
            // 如果传入的是函数引用，使用函数名作为信号名
            signalName = signal.name;
            // 如果函数名是anonymous或空字符串，尝试使用函数对象的signalName属性
            if (signalName === 'anonymous' || signalName === '') {
                signalName = signal['signalName'] || 'unknown';
            }
        } else {
            // 如果传入的是字符串，直接使用该字符串作为信号名
            signalName = signal;
        }
        return signalName;
    }

    static get hasSlots() { return this._slots.size > 0; }

    static get slotCount() { return this._slots.size; }
}

/**
 * 信号装饰器 - 用于定义信号属性
 * @param signalName 可选的信号名称，如果不提供则使用类名.属性名
 */
export function signal(signalName?: string) {
    return function (target: any, prop: string) {
        // 使用WeakMap存储每个实例的信号函数缓存
        const signalMap = new WeakMap<any, Record<string, Function>>();
        // 使用属性描述符来定义信号属性
        Object.defineProperty(target, prop, {
            get: function () {
                // 如果实例没有信号缓存，创建一个
                if (!signalMap.has(this)) {
                    signalMap.set(this, {});
                }
                const signalTemp = signalMap.get(this)!;
                // 如果当前信号函数已缓存，直接返回
                if (!signalTemp[prop]) {
                    // 创建信号函数并设置信号名
                    const finalName = signalName ? signalName
                        : `${this.constructor.name}.${prop}`;
                    const anonymous = function () { };
                    anonymous.signalName = finalName;
                    signalTemp[prop] = anonymous;
                }
                return signalTemp[prop];
            },
            enumerable: true,
            configurable: true
        });
    };
}