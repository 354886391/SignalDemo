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
export type SlotFunc<T extends (...args: any[]) => void> = T;

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

/**
 * Signal类 - 实现信号槽机制的核心类（单例模式）
 */
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
        if (!slots) {
            console.log(`No slots found for signal: ${signalName}`);
            return;
        }

        // 创建一个副本，以避免在触发过程中修改列表
        const slotsSnapshot = [...slots];

        // 依次调用每个槽函数
        for (const slot of slotsSnapshot) {
            if (slot.once) {
                // 立即处理一次性槽函数的移除
                this.disconnect(signalName, slot.callback, slot.target);
            }
            const executeCallback = () => {
                try {
                    if (slot.target) {
                        slot.callback.apply(slot.target, args);
                    } else {
                        slot.callback(...args);
                    }
                } catch (error) {
                    // 捕获错误但不影响其他槽的执行
                    setTimeout(() => {
                        console.error(`Error in slot function for signal ${signalName || 'unnamed'}:`, error);
                        // 在实际应用中，你可能需要更复杂的错误处理策略
                    }, 0);
                }
            };
            if (slot.queued) {
                // 异步调用（队列连接）
                setTimeout(() => {
                    executeCallback();
                }, 0);
            } else {
                // 同步调用
                executeCallback();
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
        const opts = {
            once: options?.once || false,
            queued: options?.queued || false
        };

        // 确定信号名称
        let signalName = this.getName(signal);

        // 绑定目标对象到回调函数
        const boundCallback = target ? slotFunc.bind(target) : slotFunc;

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
        let signalName = this.getName(signal);

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
        // 添加槽函数到信号映射
        this._slots?.get(signalName).push({
            id: ++_nextId,
            callback: callback,
            target: target,
            once: options?.once || false,
            queued: options?.queued || false
        });
        const disconnect = () => {
            this.disconnect(signalName, callback, target);
        };
        return new Connection(_nextId, disconnect);
    }

    private static getName<T extends (...args: any[]) => void>(signal: T | string): string {
        let signalName: string;
        if (typeof signal === 'function') {
            // 如果传入的是函数引用，使用函数名作为信号名
            signalName = signal.name;
            // 如果函数名是anonymous或空字符串，尝试使用函数对象的signalName属性
            if (signalName === 'anonymous' || signalName === '') {
                signalName = (signal as any).signalName || 'unknown';
            }
        } else {
            // 如果传入的是字符串，直接使用该字符串作为信号名
            signalName = signal;
        }
        return signalName;
    }
}

/**
 * 信号装饰器 - 用于定义信号属性
 * @param signalName 可选的信号名称，如果不提供则使用属性名
 */
// export function signal(signalName?: string) {
//     return function (target: any, prop: string) {
//         // 使用属性描述符来定义信号属性
//         Object.defineProperty(target, prop, {
//             get: () => {
//                 // 如果没有提供signalName，使用属性名作为信号名
//                 const finalName = signalName || prop;
//                 // 为当前实例创建一个信号函数引用
//                 const signalFunc = () => { };
//                 // 设置函数名
//                 Object.defineProperty(signalFunc, 'name', {
//                     value: finalName,
//                     configurable: true
//                 });
//                 // 设置signalName属性，以防函数名设置失败
//                 signalFunc.signalName = finalName;
//                 // 返回信号函数引用
//                 return signalFunc;
//             },
//             enumerable: true,
//             configurable: true
//         });
//     };
// }

export function signal(signalName?: string) {
    return function (target: any, prop: string) {
        // 如果没有提供signalName，使用属性名作为信号名
        const finalName = signalName || prop;
        // 使用属性描述符来定义信号属性
        Object.defineProperty(target, prop, {
            get: () => {
                // 简化：直接创建函数并设置signalName属性
                const signalFunc = function () { };
                signalFunc.signalName = finalName;
                return signalFunc;
            },
            enumerable: true,
            configurable: true
        });
    };
}