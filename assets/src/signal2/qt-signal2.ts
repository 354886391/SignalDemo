// 定义槽函数选项接口
export interface SlotOptions {
    once?: boolean;      // 自动断开（只调用一次）
    queued?: boolean;    // 异步调用（类似 Qt::QueuedConnection）
    throttle?: number;   // 节流时间（毫秒）
    debounce?: number;   // 防抖时间（毫秒）
    group?: string;      // 分组名称，用于信号分组管理
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
    throttle?: number;   // 节流时间（毫秒）
    debounce?: number;   // 防抖时间（毫秒）
    lastCallTime?: number; // 上次调用时间（用于节流）
    timeoutId?: number;    // 超时ID（用于防抖）
    group?: string;        // 分组名称
}

// 槽ID计数器
let _nextId: number = 1;

export class Signal {

    // 使用Map存储每个信号名对应的所有槽函数
    private static _slots = new Map<string, Slot<any>[]>();

    // 新增：使用Map存储分组名到信号槽ID的映射，提高分组操作性能
    private static _groupSlotMap = new Map<string, Set<{ signalName: string, slotId: number }>>();

    // 新增：分组信息缓存，避免频繁计算
    private static _groupCache: {
        groups?: string[];
        lastUpdateTime: number;
    } = { lastUpdateTime: 0 };

    // 新增：缓存有效期（毫秒）
    private static readonly CACHE_TTL = 100;

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

        // 获取信号的默认分组（如果有）
        let defaultGroup = undefined;
        if (typeof signal === 'function' && signal?.['__debugInfo']) {
            defaultGroup = signal?.['__debugInfo'].defaultGroup;
        }

        const opts = {
            once: options?.once,
            queued: options?.queued,
            throttle: options?.throttle,
            debounce: options?.debounce,
            group: options?.group || defaultGroup,  // 优先使用选项中的分组，否则使用默认分组
        };
        // 使用指定的信号名连接槽函数
        return this.addSlot(signalName, boundCallback, target || null, opts);
    }

    /**
 * 连接信号和槽函数（带节流功能）
 * @param signal 信号名或信号函数引用
 * @param slotFunc 槽函数引用
 * @param target 槽函数目标对象
 * @param wait 节流等待时间（毫秒）
 */
    static connectThrottled<T extends (...args: any[]) => void>(signal: T | string, slotFunc: SlotFunc<T>, target?: any, wait: number = 100): Connection {
        return this.connect(signal, slotFunc, target, { throttle: wait });
    }

    /**
     * 连接信号和槽函数（带防抖功能）
     * @param signal 信号名或信号函数引用
     * @param slotFunc 槽函数引用
     * @param target 槽函数目标对象
     * @param wait 防抖等待时间（毫秒）
     */
    static connectDebounced<T extends (...args: any[]) => void>(signal: T | string, slotFunc: SlotFunc<T>, target?: any, wait: number = 100): Connection {
        return this.connect(signal, slotFunc, target, { debounce: wait });
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
        const updatedSlots = slots.filter(slot => {
            const shouldRemove = slot.id === id;
            // 新增：如果有分组，从分组映射中移除
            if (shouldRemove && slot.group) {
                this._removeFromGroupMap(signalName, id, slot.group);
            }
            return !shouldRemove;
        });

        if (updatedSlots.length > 0) {
            this._slots.set(signalName, updatedSlots);
        } else {
            this._slots.delete(signalName);
        }

        // 新增：清除缓存
        this._invalidateCache();
    }

    /**
     * 断开指定分组的所有信号连接
     * @param groupName 分组名称
     */
    static disconnectByGroup(groupName: string): void {
        // 参数验证
        if (!groupName || typeof groupName !== 'string') {
            throw new Error('Group name must be a non-empty string');
        }

        // 新增：使用分组映射进行高效断开
        const groupSlots = this._groupSlotMap.get(groupName);
        if (!groupSlots) return;

        // 保存需要断开的槽，避免在遍历时修改集合
        const slotsToDisconnect = Array.from(groupSlots);

        // 断开每个槽的连接
        for (const { signalName, slotId } of slotsToDisconnect) {
            this.disconnectById(signalName, slotId);
        }

        // 清理空分组
        if (groupSlots.size === 0) {
            this._groupSlotMap.delete(groupName);
        }

        // 清除缓存
        this._invalidateCache();
    }

    /**
     * 获取指定分组的连接数量
     * @param groupName 分组名称
     * @returns 该分组中的连接数量
     */
    static getConnectionCountByGroup(groupName: string): number {
        // 参数验证
        if (!groupName || typeof groupName !== 'string') {
            return 0;
        }

        // 新增：使用分组映射直接获取数量，避免遍历所有槽
        const groupSlots = this._groupSlotMap.get(groupName);
        return groupSlots ? groupSlots.size : 0;
    }

    /**
     * 检查指定分组是否存在连接
     * @param groupName 分组名称
     * @returns 是否存在连接
     */
    static hasConnectionsInGroup(groupName: string): boolean {
        // 参数验证
        if (!groupName || typeof groupName !== 'string') {
            return false;
        }

        // 新增：使用分组映射直接检查，避免遍历所有槽
        const groupSlots = this._groupSlotMap.get(groupName);
        return groupSlots ? groupSlots.size > 0 : false;
    }

    /**
     * 获取所有分组名称
     * @returns 所有分组名称的数组
     */
    static getAllGroups(): string[] {
        // 新增：使用缓存优化频繁调用
        const now = Date.now();
        if (this._groupCache.groups && (now - this._groupCache.lastUpdateTime) < this.CACHE_TTL) {
            return [...this._groupCache.groups];
        }

        // 获取所有非空分组名称
        const groups = Array.from(this._groupSlotMap.keys()).filter(groupName => {
            const slots = this._groupSlotMap.get(groupName);
            return slots && slots.size > 0;
        });

        // 更新缓存
        this._groupCache.groups = groups;
        this._groupCache.lastUpdateTime = now;

        return [...groups];
    }

    /**
     * 新增：获取指定分组中的所有信号名称
     * @param groupName 分组名称
     * @returns 该分组中所有信号名称的数组
     */
    static getSignalsInGroup(groupName: string): string[] {
        if (!groupName || typeof groupName !== 'string') {
            return [];
        }

        const groupSlots = this._groupSlotMap.get(groupName);
        if (!groupSlots) {
            return [];
        }

        // 使用Set去重
        const signalNames = new Set<string>();
        for (const { signalName } of groupSlots) {
            signalNames.add(signalName);
        }

        return Array.from(signalNames);
    }

    // 新增：内部方法 - 添加到分组映射
    private static _addToGroupMap(signalName: string, slotId: number, groupName: string): void {
        if (!this._groupSlotMap.has(groupName)) {
            this._groupSlotMap.set(groupName, new Set());
        }
        const groupSlots = this._groupSlotMap.get(groupName)!;
        groupSlots.add({ signalName, slotId });
    }

    // 新增：内部方法 - 从分组映射中移除
    private static _removeFromGroupMap(signalName: string, slotId: number, groupName: string): void {
        const groupSlots = this._groupSlotMap.get(groupName);
        if (groupSlots) {
            // 正确查找并删除槽项，解决对象引用比较问题
            for (const slot of groupSlots) {
                if (slot.signalName === signalName && slot.slotId === slotId) {
                    groupSlots.delete(slot);
                    break;
                }
            }
            // 如果分组为空，删除该分组
            if (groupSlots.size === 0) {
                this._groupSlotMap.delete(groupName);
            }
        }
    }

    // 新增：内部方法 - 使缓存失效
    private static _invalidateCache(): void {
        this._groupCache.groups = undefined;
        this._groupCache.lastUpdateTime = 0;
    }

    /**
     * 新增：重置所有信号和分组（用于测试或清理）
     */
    static reset(): void {
        this._slots.clear();
        this._groupSlotMap.clear();
        this._invalidateCache();
        _nextId = 1;
    }

    /**
    * 将一个信号转发到另一个信号，可选择参数转换
    * @param sourceSignal 源信号
    * @param targetSignal 目标信号
    * @param options 连接选项
    * @param transform 可选的参数转换函数
    * @returns 连接对象，可用于断开转发
    */
    static forwardTo<T extends (...args: any[]) => void, U extends (...args: any[]) => void>(
        sourceSignal: T | string,
        targetSignal: U | string,
        options?: SlotOptions,
        transform?: (args: Parameters<T>) => Parameters<U>
    ): Connection {
        // 创建转发函数，根据是否有转换函数来决定如何处理参数
        const forwarder = (...args: Parameters<T>) => {
            if (transform) {
                // 使用转换函数处理参数
                const transformedArgs = transform(args);
                this.emit(targetSignal, ...transformedArgs);
            } else {
                // 无转换函数时，直接转发参数
                this.emit(targetSignal, ...args as any);
            }
        };

        // 连接源信号和转发函数
        return this.connect(sourceSignal, forwarder, undefined, options);
    }

    /**
      * 添加槽函数的辅助方法
      * @param signalName 信号名称
      * @param callback 槽函数回调
      * @param target 槽函数目标对象
      * @param options 连接选项
      */
    private static addSlot<T extends (...args: any[]) => void>(signalName: string, callback: SlotFunc<T>, target: any, options?: SlotOptions): Connection {
        // 参数验证
        if (!signalName || typeof signalName !== 'string') {
            throw new Error('Signal name must be a non-empty string');
        }

        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (!this._slots.has(signalName)) {
            this._slots.set(signalName, []);
        }

        // 增加ID并创建槽函数
        const id = ++_nextId;
        const group = options?.group;

        // 添加槽函数到信号映射
        const slots = this._slots.get(signalName)!;
        const slot: Slot<T> = {
            id: id,
            callback: callback,
            target: target,
            once: options?.once || false,
            queued: options?.queued || false,
            throttle: options?.throttle || undefined,
            debounce: options?.debounce || undefined,
            group: group,
        };
        slots.push(slot);

        // 新增：如果有分组，添加到分组映射中
        if (group) {
            this._addToGroupMap(signalName, id, group);
        }

        // 新增：清除缓存
        this._invalidateCache();

        const disconnect = () => {
            this.disconnectById(signalName, id);
        };
        return new Connection(id, disconnect);
    }


    private static executeSlot<T extends (...args: any[]) => void>(slot: Slot<T>, args: Parameters<T>): void {
        try {

            // 处理节流
            if (slot.throttle) {
                const now = Date.now();
                // 如果距离上次调用的时间小于节流时间，则不执行
                if (slot.lastCallTime && (now - slot.lastCallTime) < slot.throttle) {
                    return;
                }
                slot.lastCallTime = now;
            }
            // 处理防抖
            if (slot.debounce) {
                // 清除之前的超时
                if (slot.timeoutId) {
                    clearTimeout(slot.timeoutId);
                }
                // 设置新的超时
                slot.timeoutId = window.setTimeout(() => {
                    if (slot.target) {
                        slot.callback.apply(slot.target, args);
                    } else {
                        slot.callback(...args);
                    }
                    // 执行后清理超时ID
                    slot.timeoutId = undefined;
                }, slot.debounce);
                // 不立即执行
                return;
            }
            // 正常执行回调
            if (slot.target) {
                slot.callback.apply(slot.target, args);
            } else {
                slot.callback(...args);
            }
        } catch (error) {
            // 增强错误处理，添加更多上下文信息
            const signalName = slot['signalName'] || 'unnamed';
            const targetName = slot.target ? slot.target.constructor.name : 'none';
            console.error(`Error in slot function for signal "${signalName}" (target: ${targetName}):`, error);

            // 可选：触发全局错误信号以便应用级处理
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('signal:error', {
                    detail: { signalName, error, target: slot.target }
                }));
            }
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
 * @param signalName 可选的信号名称
 * @param options 信号选项
 */
export function signal(signalName?: string, options?: { debug?: boolean, group?: string }) { // 添加defaultGroup选项
    return function (target: any, prop: string) {
        const signalMap = new WeakMap<any, Record<string, Function>>();

        Object.defineProperty(target, prop, {
            get: function () {
                if (!signalMap.has(this)) {
                    signalMap.set(this, {});
                }
                const signalTemp = signalMap.get(this)!;

                if (!signalTemp[prop]) {
                    const finalName = signalName ? signalName : `${this.constructor.name}.${prop}`;
                    const anonymous = function () {
                        if (options?.debug) {
                            console.log(`Signal ${finalName} called directly (should use Signal.emit instead)`);
                        }
                    };
                    anonymous.signalName = finalName;

                    // 添加调试信息和默认分组
                    if (options) {
                        Object.defineProperty(anonymous, '__debugInfo', {
                            value: {
                                signalName: finalName,
                                owner: this,
                                createdAt: new Date().toISOString(),
                                group: options.group || undefined
                            },
                            enumerable: false
                        });
                    }

                    signalTemp[prop] = anonymous;
                }
                return signalTemp[prop];
            },
            enumerable: true,
            configurable: true
        });
    };
}