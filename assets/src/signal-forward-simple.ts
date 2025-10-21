// import { Signal, signal } from './qt-signal';

// // 信号转发的简单示例
// class SourceComponent {
//     @signal()
//     public dataUpdated!: Signal<(data: string, timestamp: number) => void>;
    
//     updateData(data: string) {
//         console.log('源组件更新数据:', data);
//         this.dataUpdated.emit(data, Date.now());
//     }
// }

// class TargetComponent {
//     @signal()
//     public dataReceived!: Signal<(data: string, timestamp: number) => void>;
    
//     constructor() {
//         this.dataReceived.connect((data, timestamp) => {
//             console.log('目标组件收到数据:', data, '时间戳:', timestamp);
//         });
//     }
// }

// // 使用示例
// function simpleForwardToDemo() {
//     const source = new SourceComponent();
//     const target = new TargetComponent();
    
//     // 直接转发信号（参数类型匹配）
//     // 源信号的参数类型必须与目标信号的参数类型匹配
//     // 使用forwardTo将字段的dataUpdated信号转发到dataReceived信号
//     const connection = source.dataUpdated.forwardTo(target.dataReceived);
    
//     console.log('\n=== 测试信号转发 ===');
//     source.updateData('Hello, forwardTo!');
    
//     console.log('\n=== 断开转发连接 ===');
//     connection.disconnect();
//     source.updateData('这条消息不会被转发');
// }

// simpleForwardToDemo();