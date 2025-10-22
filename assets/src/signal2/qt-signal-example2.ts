import { Signal, signal } from "./qt-signal2";

const miaowed = '123';

class Tom {

    // 定义信号miaowed，参数类型为(id: number, msg: string)
    @signal(miaowed, { debug: true })
    miaowed: (id: number, msg: string) => void;
    // 定义信号hovered，参数类型为(isHovered: boolean)
    @signal(null, { debug: true })
    hovered: (isHovered: boolean) => void;

    @signal()
    hovered_forward: (isHovered: boolean) => void;


    /**
     *  触发喵喵信号的方法
     * 
     * 该方法调用emit函数触发预定义的miaowed信号
     */
    miaow() {
        Signal.emit(this.miaowed, 42, "Meow!");  // 此处emit应该自动推断出miaowed的参数类型(id: number, msg: string)
    }

    /**
     * 触发徘徊信号的方法
     * 该方法调用emit函数触发预定义的hovered信号
     */
    hover(isHovered: boolean) {
        Signal.emit(this.hovered, isHovered);     // 此处emit应该自动推断出hovered的参数类型(isHovered: boolean)
    }

    forward(isHovered: boolean) {
        Signal.emit(this.hovered_forward, isHovered);     // 此处emit应该自动推断出hovered的参数类型(isHovered: boolean)
    }
}

class Jerry {

    onRunaway(id: number, msg: string) {
        console.log(this.constructor.name + ' received miaow: ' + id, msg);
    }

    onRunawayOnce(id: number, msg: string) {
        console.log(this.constructor.name + ' triggered once:', id, msg);
    }

    onRunawayQueued(id: number, msg: string) {
        console.log(this.constructor.name + ' is a queued slot:', id, msg);
    }

    onHover(isHovered: boolean) {
        console.log(this.constructor.name + ' received hover: ' + (isHovered ? 'true' : 'false'));
    }

    onHover_forward(isHovered: boolean) {
        console.log(this.constructor.name + ' received hover2: ' + (isHovered ? 'true' : 'false'));
    }
}

class Example {
    tom: Tom;
    jerry: Jerry;

    constructor() {
        this.test();
    }

    test() {
        // 创建信号发射器和槽接收器
        this.tom = new Tom();
        this.jerry = new Jerry();

        // 连接信号和槽函数
        Signal.connect(miaowed, this.jerry.onRunaway, this.jerry);
        Signal.connect(this.tom.miaowed, this.jerry.onRunawayOnce, this.jerry, { once: true });
        Signal.connect(this.tom.miaowed, this.jerry.onRunawayQueued, this.jerry, { queued: true });
        // Signal.connect(this.tom.hovered, this.jerry.onHover, this.jerry);
        Signal.connect(this.tom.hovered_forward, this.jerry.onHover_forward, this.jerry);

        console.log('\n--- 触发信号 ---');
        this.tom.miaow();

        // 获取并打印调试信息
        if (this.tom.miaowed?.['__debugInfo']) {
            console.log("\n调试信息:", this.tom.miaowed?.['__debugInfo']);
        }

        console.log('\n--- 再次触发信号（一次性槽函数不会再次执行）---');
        this.tom.miaow();

        console.log('\n--- 触发信号 ---');
        this.tom.hover(true);
        this.tom.hover(false);

        console.log('\n--- 信号转发 ---');
        const connection = Signal.forwardTo(this.tom.hovered, this.tom.hovered_forward);
        this.tom.hover(true);

        console.log('\n--- 断开信号转发连接 ---');
        connection.disconnect();
        this.tom.hover(true);
        this.tom.forward(true);
        console.log('\n--- 结束 ---');

    }
}

// var example = new Example();