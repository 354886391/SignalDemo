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

type GroupInfo = Set<{ signalName: string, slotId: number }>;

interface SignalInfo {
    slots: SlotInfo<any>[],
    /**key: groupName, value: slotId集合 */
    groups: Map<string, Set<number>>
}

// 定义槽函数项接口
interface SlotInfo<T extends (...args: any[]) => void> {
    id: number;
    callback: SlotFunc<T>;
    target: any;
    once: boolean;
    queued: boolean;
    group?: string;        // 分组名称

    throttle?: number;   // 节流时间（毫秒）
    debounce?: number;   // 防抖时间（毫秒）
    lastCallTime?: number; // 上次调用时间（用于节流）
    timeoutId?: number;    // 超时ID（用于防抖）
}

// 定义槽函数选项接口
interface SlotOptions {
    once?: boolean;      // 自动断开（只调用一次）
    queued?: boolean;    // 异步调用（类似 Qt::QueuedConnection）
    group?: string;      // 分组名称，用于信号分组管理
    throttle?: number;   // 节流时间（毫秒）
    debounce?: number;   // 防抖时间（毫秒）
}

// 槽ID计数器
let _nextId: number = 1;

/**
 * 信号系统核心类 - 类似于Qt的信号槽机制
 */
// 修改_groupCache的定义
export class Signal {

    // 缓存相关配置
    private static readonly CACHE_TTL = 100; // 缓存有效期（毫秒）

    // 分组信息缓存，避免频繁计算
    private static _groupCache: { groups?: string[]; lastUpdateTime: number; } = { lastUpdateTime: 0 };

    // 优化：合并数据结构为复合结构
    private static _signals: Map<string, SignalInfo> = new Map();

    // 全局分组映射（分组名 -> 信号槽关联集合）groupName -> { signalName: string, slotId: number }
    private static _globals: Map<string, GroupInfo> = new Map();

    /**
     * 触发信号
     * @param signal 信号名或信号函数引用
     * @param args 传递给槽函数的参数
     */
    static emit<T extends (...args: any[]) => void>(signal: T | string, ...args: Parameters<T>): void {
        const signalName = this.getName(signal);
        const signalData = this._getSignalData(signalName);

        if (!signalData || signalData.slots.length === 0) return;

        // 创建需要执行的槽函数列表副本，避免在执行过程中修改原数组
        const slotsToExecute = [...signalData.slots];

        for (const slot of slotsToExecute) {
            this.executeSlot(slot, args);

            // 如果是一次性连接，执行后断开
            if (slot.once) {
                this.disconnectById(signalName, slot.id);
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
            defaultGroup = signal?.['__debugInfo'].group;
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
        const signalData = this._getSignalData(signalName);

        if (!signalData) return;

        // 过滤掉匹配的槽函数
        const updatedSlots = signalData.slots.filter(slot => {
            // 保留不匹配的槽函数
            const isMatch = slot.callback === slotFunc || (target && slot.target === target);
            // 如果匹配且有分组，从分组映射中移除
            if (isMatch && slot.group) {
                this._removeFromGlobalGroup(signalName, slot.id, slot.group);
                this._removeFromSignalGroup(signalName, slot.id, slot.group);
            }
            return !isMatch;
        });

        // 更新信号数据
        if (updatedSlots.length > 0) {
            signalData.slots = updatedSlots;
        } else {
            this._signals.delete(signalName);
        }

        this._invalidateCache();
    }

    static disconnectById(signalName: string, id: number): void {
        const signalData = this._getSignalData(signalName);
        if (!signalData) return;

        // 查找并获取需要断开的槽函数
        const slotIndex = signalData.slots.findIndex(slot => slot.id === id);
        if (slotIndex === -1) return;

        const slot = signalData.slots[slotIndex];
        // 如果有分组，从分组映射中移除
        if (slot.group) {
            this._removeFromGlobalGroup(signalName, slot.id, slot.group);
            this._removeFromSignalGroup(signalName, slot.id, slot.group);
        }

        // 从信号槽列表中移除
        signalData.slots.splice(slotIndex, 1);

        // 如果信号没有槽函数了，删除该信号数据
        if (signalData.slots.length === 0) {
            this._signals.delete(signalName);
        }

        // 清除缓存
        this._invalidateCache();
    }

    // 断开分组和其他方法保持逻辑不变，但使用新的数据结构
    static disconnectByGroup(groupName: string): void {
        // 参数验证
        if (!groupName || typeof groupName !== 'string') {
            throw new Error('Group name must be a non-empty string');
        }

        // 使用分组映射进行高效断开
        const groupSlots = this._globals.get(groupName);
        if (!groupSlots) return;

        // 保存需要断开的槽，避免在遍历时修改集合
        const slotsToDisconnect = Array.from(groupSlots);

        // 断开每个槽的连接
        for (const { signalName, slotId } of slotsToDisconnect) {
            this.disconnectById(signalName, slotId);
        }

        // 清理空分组
        if (groupSlots.size === 0) {
            this._globals.delete(groupName);
        }

        // 清除缓存
        this._invalidateCache();
    }

    // 其他分组相关方法实现类似调整
    static getConnectionCountByGroup(groupName: string): number {
        // 参数验证
        if (!groupName || typeof groupName !== 'string') {
            return 0;
        }

        // 使用分组映射直接获取数量，避免遍历所有槽
        const groupSlots = this._globals.get(groupName);
        return groupSlots ? groupSlots.size : 0;
    }

    static hasConnectionsInGroup(groupName: string): boolean {
        // 参数验证
        if (!groupName || typeof groupName !== 'string') {
            return false;
        }

        // 使用分组映射直接检查，避免遍历所有槽
        const groupSlots = this._globals.get(groupName);
        return groupSlots ? groupSlots.size > 0 : false;
    }

    static getAllGroups(): string[] {
        // 使用缓存优化频繁调用
        const now = Date.now();
        if (this._groupCache.groups && (now - this._groupCache.lastUpdateTime) < this.CACHE_TTL) {
            return [...this._groupCache.groups];
        }

        // 获取所有非空分组名称
        const groups = Array.from(this._globals.keys()).filter(groupName => {
            const slots = this._globals.get(groupName);
            return slots && slots.size > 0;
        });

        // 更新缓存
        this._groupCache.groups = groups;
        this._groupCache.lastUpdateTime = now;

        return [...groups];
    }

    static getSignalsInGroup(groupName: string): string[] {
        if (!groupName || typeof groupName !== 'string') {
            return [];
        }

        const groupSlots = this._globals.get(groupName);
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

    // 辅助方法：获取信号数据
    private static _getSignalData(signalName: string) {
        if (!this._signals.has(signalName)) {
            this._signals.set(signalName, { slots: [], groups: new Map() });
        }
        return this._signals.get(signalName);
    }

    // 辅助方法：获取全局分组数据
    private static _getGlobalGroupData(groupName: string) {
        if (!this._globals.has(groupName)) {
            this._globals.set(groupName, new Set());
        }
        return this._globals.get(groupName);
    }

    // 辅助方法：添加到全局分组
    private static _addToGlobalGroup(signalName: string, slotId: number, groupName: string) {
        const groupData = this._getGlobalGroupData(groupName);
        groupData.add({ signalName, slotId });
    }

    // 辅助方法：从全局分组中移除
    private static _removeFromGlobalGroup(signalName: string, slotId: number, groupName: string) {
        const groupData = this._globals.get(groupName);
        if (!groupData) return;

        // 正确查找并删除槽项，解决对象引用比较问题
        for (const slot of groupData) {
            if (slot.signalName === signalName && slot.slotId === slotId) {
                groupData.delete(slot);
                break;
            }
        }

        // 如果分组为空，删除该分组
        if (groupData.size === 0) {
            this._globals.delete(groupName);
        }
    }

    // 辅助方法：添加到信号内部分组
    private static _addToSignalGroup(signalName: string, slotId: number, groupName: string) {
        const signalData = this._getSignalData(signalName);
        if (!signalData.groups.has(groupName)) {
            signalData.groups.set(groupName, new Set());
        }
        signalData.groups.get(groupName)!.add(slotId);
    }

    // 辅助方法：从信号内部分组中移除
    private static _removeFromSignalGroup(signalName: string, slotId: number, groupName: string) {
        const signalData = this._getSignalData(signalName);
        const groupSlots = signalData.groups.get(groupName);

        if (!groupSlots) return;

        groupSlots.delete(slotId);

        // 如果分组为空，删除该分组
        if (groupSlots.size === 0) {
            signalData.groups.delete(groupName);
        }
    }

    // 内部方法 - 使缓存失效
    private static _invalidateCache(): void {
        this._groupCache.groups = undefined;
        this._groupCache.lastUpdateTime = 0;
    }

    /**
     * 重置所有信号和分组（用于测试或清理）
     */
    static reset(): void {
        this._signals.clear();
        this._globals.clear();
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

        // 获取信号数据
        const signalData = this._getSignalData(signalName);

        // 增加ID并创建槽函数
        const id = ++_nextId;
        const group = options?.group;

        // 添加槽函数
        const slot: SlotInfo<T> = {
            id: id,
            callback: callback,
            target: target,
            once: options?.once || false,
            queued: options?.queued || false,
            throttle: options?.throttle || undefined,
            debounce: options?.debounce || undefined,
            group: group,
        };
        signalData.slots.push(slot);

        // 如果有分组，添加到分组映射中
        if (group) {
            this._addToGlobalGroup(signalName, id, group);
            this._addToSignalGroup(signalName, id, group);
        }

        // 清除缓存
        this._invalidateCache();

        const disconnect = () => {
            this.disconnectById(signalName, id);
        };
        return new Connection(id, disconnect);
    }

    // 保持executeSlot方法不变
    private static executeSlot<T extends (...args: any[]) => void>(slot: SlotInfo<T>, args: Parameters<T>): void {
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

    // 保持getName方法不变
    private static getName<T extends (...args: any[]) => void>(signal: T | string): string {
        let signalName: string;
        if (typeof signal === 'function') {
            // 如果传入的是函数引用，使用函数名作为信号名
            signalName = signal.name;
            // 如果函数名是anonymous或空字符串，尝试使用函数对象的signalName属性
            if (signalName === 'anonymous' || signalName === '') {
                signalName = signal['__signalName'] || 'unknown';
            }
        } else {
            // 如果传入的是字符串，直接使用该字符串作为信号名
            signalName = signal;
        }
        return signalName;
    }

    // 修复hasSlots属性
    static get hasSlots() {
        for (const signalData of this._signals.values()) {
            if (signalData.slots.length > 0) {
                return true;
            }
        }
        return false;
    }

    // 修复slotCount属性，现在正确计算所有槽函数数量
    static get slotCount() {
        let count = 0;
        for (const signalData of this._signals.values()) {
            count += signalData.slots.length;
        }
        return count;
    }
}

/**
 * 信号装饰器 - 用于定义信号属性
 * @param signalName 可选的信号名称
 * @param options 信号选项
 */
export function signal(signalName?: string, options?: { debug?: boolean, group?: string }) {
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
                    // 添加信号名属性
                    anonymous['__signalName'] = finalName;
                    // 添加调试信息和默认分组
                    anonymous['__debugInfo'] = {
                        owner: this,
                        group: options?.group || undefined,
                        createdAt: new Date().toISOString()
                    };
                    signalTemp[prop] = anonymous;
                }
                return signalTemp[prop];
            },
            enumerable: true,
            configurable: true
        });
    };
}