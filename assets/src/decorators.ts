import { Signal, SlotOptions } from './qt-signal';

// 扩展SlotOptions接口，添加emitterPropertyName选项
interface ExtendedSlotOptions extends SlotOptions {
    /**
     * 信号发射器在当前对象中的属性名
     * 如果提供此值，会自动从当前对象的该属性中查找信号
     */
    emitterPropertyName?: string;
    
    /**
     * 信号发射器对象
     * 如果提供此值，直接使用该对象查找信号
     */
    emitter?: any;
}

// 存储待连接的槽函数
interface SlotMetadata {
    signalName: string;
    methodName: string;
    options: ExtendedSlotOptions;
    emitterProperty?: string;
    emitterObject?: any;
}

const SLOTS_METADATA_KEY = Symbol('slots');



/**
 * 槽函数装饰器
 * @param signalName 信号名称
 * @param emitterOrOptions 信号发射器对象或属性名或选项对象
 * @param options 选项对象（如果第二个参数是发射器）
 */
export function slot(signalName: string, emitterOrOptions?: any, options?: SlotOptions) {
    return function (target: any, propertyKey: string) {
        const constructor = target.constructor;
        const existingSlots: SlotMetadata[] = constructor.prototype[SLOTS_METADATA_KEY] || [];
        
        // 解析参数
        let slotOptions: ExtendedSlotOptions = {};
        let emitterObject: any = undefined;
        let emitterProperty: string | undefined = undefined;
        
        if (options) {
            // 第二个参数是发射器，第三个参数是选项
            slotOptions = options;
            
            // 检查第二个参数是否为字符串（属性名）
            if (typeof emitterOrOptions === 'string') {
                emitterProperty = emitterOrOptions;
            } else {
                // 否则认为是发射器对象
                emitterObject = emitterOrOptions;
            }
        } else if (emitterOrOptions && typeof emitterOrOptions !== 'object') {
            // 第二个参数是发射器属性名
            emitterProperty = emitterOrOptions;
        } else if (emitterOrOptions) {
            // 第二个参数是选项对象
            slotOptions = emitterOrOptions;
        }
        
        existingSlots.push({
            signalName,
            methodName: propertyKey,
            options: slotOptions,
            emitterProperty,
            emitterObject
        });
        constructor.prototype[SLOTS_METADATA_KEY] = existingSlots;
    };
}

// 用于自动连接的基类
export class  AutoConnect {

    constructor() {
        // 直接调用连接方法，不使用setTimeout
        this.connectSlots();
    }

    private connectSlots() {
        // 通过构造函数获取元数据，而不是通过实例原型
        const slots: SlotMetadata[] = (this.constructor as any).prototype[SLOTS_METADATA_KEY] || [];
        
        slots.forEach(metadata => {
            // 查找信号发射器
            const emitter = this.findSignalEmitter(metadata);
            if (emitter) {
                // 尝试获取信号对象
                const signalObj = (emitter as any)[metadata.signalName];
                if (signalObj && typeof signalObj.connect === 'function') {
                    const slotMethod = (this as any)[metadata.methodName];
                    if (typeof slotMethod === 'function') {
                        signalObj.connect(slotMethod.bind(this), metadata.options);
                    }
                }
            }
        });
    }

    private findSignalEmitter(metadata: SlotMetadata): any {
        // 1. 如果有直接提供的发射器对象，优先使用
        if (metadata.emitterObject) {
            return metadata.emitterObject;
        }
        
        // 2. 如果指定了发射器属性名（从装饰器参数），从该属性获取发射器
        if (metadata.emitterProperty) {
            const emitter = (this as any)[metadata.emitterProperty];
            if (emitter) {
                return emitter;
            }
        }
        
        // 3. 如果指定了emitterPropertyName（从options对象），从该属性获取发射器
        if (metadata.options.emitterPropertyName) {
            const emitter = (this as any)[metadata.options.emitterPropertyName];
            if (emitter) {
                return emitter;
            }
        }
        
        // 4. 如果信号在当前对象上
        if ((this as any)[metadata.signalName]) {
            return this;
        }
        
        return null;
    }
}