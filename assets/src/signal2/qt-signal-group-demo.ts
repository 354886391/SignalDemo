// import { Signal, signal } from './qt-signal2';

// // 定义一个带信号的类
// class UserManager {
//     @signal('userLoggedIn', { defaultGroup: 'userEvents' })
//     userLoggedIn!: (username: string, userId: number) => void;

//     @signal('userLoggedOut')
//     userLoggedOut!: (userId: number) => void;

//     login(username: string, userId: number) {
//         console.log(`User ${username} (ID: ${userId}) logged in`);
//         Signal.emit(this.userLoggedIn, username, userId);
//     }

//     logout(userId: number) {
//         console.log(`User (ID: ${userId}) logged out`);
//         Signal.emit(this.userLoggedOut, userId);
//     }
// }

// // 创建用户管理器实例
// const userManager = new UserManager();

// // 使用分组连接信号
// const uiGroup = 'uiHandlers';
// const analyticsGroup = 'analyticsHandlers';
// const auditGroup = 'auditHandlers';

// // 连接多个分组的处理函数
// Signal.connect(userManager.userLoggedIn, (username, userId) => {
//     console.log(`UI: Show welcome message for ${username}`);
// }, undefined, { group: uiGroup });

// Signal.connect(userManager.userLoggedOut, (userId) => {
//     console.log(`UI: Show login screen (User ID: ${userId})`);
// }, undefined, { group: uiGroup });

// Signal.connect(userManager.userLoggedIn, (username) => {
//     console.log(`Analytics: Track login event for ${username}`);
// }, undefined, { group: analyticsGroup });

// Signal.connect(userManager.userLoggedIn, (username, userId) => {
//     console.log(`Audit: Log user ${username} (ID: ${userId}) login at ${new Date().toISOString()}`);
// }, undefined, { group: auditGroup });

// // 显示所有分组及其信息
// console.log('Available groups:', Signal.getAllGroups());
// console.log('UI group connections count:', Signal.getConnectionCountByGroup(uiGroup));
// console.log('Signals in UI group:', Signal.getSignalsInGroup(uiGroup));

// // 触发登录事件
// console.log('\n--- Triggering login ---');
// userManager.login('john_doe', 12345);

// // 断开UI分组的所有连接
// console.log('\n--- Disconnecting UI handlers ---');
// Signal.disconnectByGroup(uiGroup);
// console.log('UI group has connections:', Signal.hasConnectionsInGroup(uiGroup));

// // 再次触发登录事件
// console.log('\n--- Triggering login again ---');
// userManager.login('jane_smith', 67890);

// // 显示最终分组状态
// console.log('\n--- Final groups ---');
// console.log('Available groups:', Signal.getAllGroups());

// // 清理资源（实际应用中通常不需要）
// // Signal.reset();



import { Signal, signal, SlotOptions } from './qt-signal2';

// 定义一个带信号的类
class UserManager {
    @signal('userLoggedIn', { debug: true, group: 'userEvents' }) // 设置默认分组
    userLoggedIn!: () => void;

    @signal('userLoggedOut')
    userLoggedOut!: () => void;

    login(username: string) {
        console.log(`User ${username} logged in`);
        Signal.emit(this.userLoggedIn);
    }

    logout() {
        console.log('User logged out');
        Signal.emit(this.userLoggedOut);
    }
}

// 创建用户管理器实例
const userManager = new UserManager();

// 使用分组连接信号
const uiGroupOptions: SlotOptions = { group: 'uiHandlers' };
const analyticsGroupOptions: SlotOptions = { group: 'analyticsHandlers' };

// 连接到UI分组的处理函数
Signal.connect(userManager.userLoggedIn, () => {
    console.log('UI: Show welcome message');
}, undefined, uiGroupOptions);

Signal.connect(userManager.userLoggedOut, () => {
    console.log('UI: Show login screen');
}, undefined, uiGroupOptions);

// 连接到分析分组的处理函数
Signal.connect(userManager.userLoggedIn, () => {
    console.log('Analytics: Track login event');
}, undefined, analyticsGroupOptions);

Signal.connect(userManager.userLoggedOut, () => {
    console.log('Analytics: Track logout event');
}, undefined, analyticsGroupOptions);

// 使用默认分组的处理函数
// 由于userLoggedIn设置了默认分组'userEvents'，所以这里不需要再指定group选项
Signal.connect(userManager.userLoggedIn, () => {
    console.log('Audit: Log user login time');
});

// 显示所有分组
console.log('Available groups:', Signal.getAllGroups());

// 触发登录事件
console.log('\n--- Triggering login ---');
userManager.login('john_doe');

// 断开UI分组的所有连接
console.log('\n--- Disconnecting UI handlers ---');
Signal.disconnectByGroup('uiHandlers');

// 再次触发登录事件，只有分析和审计处理器会响应
console.log('\n--- Triggering login again ---');
userManager.login('john_doe');

// 检查各分组的连接状态
console.log('\n--- Group status ---');
console.log('UI group has connections:', Signal.hasConnectionsInGroup('uiHandlers'));
console.log('Analytics group has connections:', Signal.hasConnectionsInGroup('analyticsHandlers'));
console.log('User events group connections count:', Signal.getConnectionCountByGroup('userEvents'));

// 断开所有分析分组的连接
console.log('\n--- Disconnecting all analytics handlers ---');
Signal.disconnectByGroup('analyticsHandlers');

// 显示最终分组状态
console.log('\n--- Final groups ---');
console.log('Available groups:', Signal.getAllGroups());