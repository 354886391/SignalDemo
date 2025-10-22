// import { Signal, signal } from "./qt-signal2";

// function forwardToDemo() {
//     // 使用装饰器定义的信号示例
//     class UserService {
//         @signal()
//         userRegistered: (username: string, email: string) => void;

//         registerUser(username: string, email: string) {
//             console.log(`\n注册用户: ${username}, ${email}`);
//             Signal.emit(this.userRegistered, username, email);
//         }
//     }

//     class AuditService {
//         @signal()
//         auditEvent: (eventType: string, details: any) => void;

//         constructor() {
//             Signal.connect(this.auditEvent, (eventType, details) => {
//                 console.log(`审计日志: ${eventType} -`, details);
//             });
//         }
//     }

//     const userService = new UserService();
//     const auditService = new AuditService();

//     // 转发用户注册信号到审计事件信号
//     Signal.forwardTo(userService.userRegistered, auditService.auditEvent, { once: false });

//     // 测试类信号转发
//     userService.registerUser('johndoe', 'john@example.com');
//     userService.registerUser('janedoe', 'jane@example.com');
// }

// forwardToDemo();


import { Signal, signal } from "./qt-signal2";

// 示例类定义
class UserService {
    @signal()
    userLoggedIn: (username: string, userId: number) => void;
}

class AnalyticsService {
    @signal()
    logEvent: (eventType: string, eventData: { user: string, id: number }) => void;

    constructor() {
        // 连接日志事件信号到处理函数
        Signal.connect(this.logEvent, (eventType, eventData) => {
            console.log(`记录事件: ${eventType}`, eventData);
        });
    }
}

// 创建实例并演示信号转发
function forwardToDemo() {
    const userService = new UserService();
    const analyticsService = new AnalyticsService();

    // 修复：使用正确的参数转换函数语法
    const connection = Signal.forwardTo(
        userService.userLoggedIn,
        analyticsService.logEvent,
        { once: false },
        // 添加类型断言，确保返回的是正确的元组类型
        (args): any => {
            const [username, userId] = args;
            return [
                'user_login',
                { user: username, id: userId }
            ];
        }
    );

    // 触发源信号
    Signal.emit(userService.userLoggedIn, 'johndoe', 12345);

    // 断开转发连接
    connection.disconnect();
}

// 运行示例
forwardToDemo();