import { Signal, signal } from "./qt-signal2";

class UserInputHandler {
    @signal()
    searchInput: (keyword: string) => void;

    @signal()
    windowResize: (width: number, height: number) => void;

    @signal()
    scroll: (scrollTop: number) => void;

    // 模拟用户输入
    userType(keyword: string) {
        console.log(`用户输入: ${keyword}`);
        Signal.emit(this.searchInput, keyword);
    }

    // 模拟窗口调整
    resizeWindow(width: number, height: number) {
        console.log(`窗口调整: ${width}x${height}`);
        Signal.emit(this.windowResize, width, height);
    }

    // 模拟页面滚动
    pageScroll(scrollTop: number) {
        console.log(`页面滚动: ${scrollTop}px`);
        Signal.emit(this.scroll, scrollTop);
    }
}

class App {
    private handler: UserInputHandler;

    constructor() {
        this.handler = new UserInputHandler();
        this.setupConnections();
        this.runDemo();
    }

    private setupConnections() {
        // 搜索输入使用防抖（300ms）- 只在用户停止输入后执行一次
        Signal.connectDebounced(this.handler.searchInput, this.handleSearch, this, 300);

        // 窗口调整使用节流（100ms）- 定期执行但不超过限制频率
        Signal.connectThrottled(this.handler.windowResize, this.handleResize, this, 100);

        // 页面滚动使用节流（200ms）- 定期执行但不超过限制频率
        Signal.connectThrottled(this.handler.scroll, this.handleScroll, this, 200);
    }

    private handleSearch(keyword: string) {
        console.log(`[搜索执行] 关键词: ${keyword}`);
        // 实际搜索逻辑...
    }

    private handleResize(width: number, height: number) {
        console.log(`[尺寸调整执行] 尺寸: ${width}x${height}`);
        // 实际调整逻辑...
    }

    private handleScroll(scrollTop: number) {
        console.log(`[滚动执行] 位置: ${scrollTop}px`);
        // 实际滚动逻辑...
    }

    private runDemo() {
        console.log("===== 节流和防抖功能演示 =====\n");

        // 模拟搜索输入（快速连续输入）
        console.log("\n----- 搜索输入防抖演示 -----");
        this.handler.userType("a");
        this.handler.userType("ab");
        this.handler.userType("abc");

        // 模拟窗口调整（快速连续调整）
        console.log("\n----- 窗口调整节流演示 -----");
        this.handler.resizeWindow(800, 600);
        this.handler.resizeWindow(850, 600);
        setTimeout(() => {
            this.handler.resizeWindow(900, 600);
        }, 200);

        // 模拟页面滚动（快速连续滚动）
        console.log("\n----- 页面滚动节流演示 -----");
        this.handler.pageScroll(100);
        this.handler.pageScroll(200);
        setTimeout(() => {
            this.handler.pageScroll(300);
        }, 300);
        this.handler.pageScroll(400);
        this.handler.pageScroll(500);


        // 延迟后再次输入，测试防抖效果
        setTimeout(() => {
            console.log("\n----- 防抖效果测试 -----");
            this.handler.userType("abcd");
        }, 500);
    }
}

// 运行演示
const app = new App();
