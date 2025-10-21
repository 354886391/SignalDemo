import { Signal, signal } from "./qt-signal2";

function forwardToDemo() {
    // 使用装饰器定义的信号示例
    class UserService {
        @signal()
        userRegistered: (username: string, email: string) => void;
        
        registerUser(username: string, email: string) {
            console.log(`\n注册用户: ${username}, ${email}`);
            Signal.emit(this.userRegistered, username, email);
        }
    }
    
    class AuditService {
        @signal()
        auditEvent: (eventType: string, details: any) => void;
        
        constructor() {
            Signal.connect(this.auditEvent, (eventType, details) => {
                console.log(`审计日志: ${eventType} -`, details);
            });
        }
    }
    
    const userService = new UserService();
    const auditService = new AuditService();
    
    // 转发用户注册信号到审计事件信号
    Signal.forwardTo(userService.userRegistered, auditService.auditEvent, { once: false });
    
    // 测试类信号转发
    userService.registerUser('johndoe', 'john@example.com');
    userService.registerUser('janedoe', 'jane@example.com');
}

forwardToDemo();