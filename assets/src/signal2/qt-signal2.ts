export class Signal {

    signalName: string = '';

    emit(...args: any[]): void {

    }

    connect(signalName: string, target: any, options?: any): void {
    }
}

export function signal(signalName: string) {
    return function (target: any, prop: string) {
        const instance = new Signal();
        Object.defineProperty(target, prop, {
            enumerable: true,
            configurable: true,
            get() { return instance; }
        });
    };
}

export function slot(signalName: string, options?: any) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        // 槽函数装饰器逻辑可以在这里实现，例如：
        // 1. 自动连接信号和槽函数
        // 2. 处理队列槽函数
        // 3. 处理_once槽函数
    };
}