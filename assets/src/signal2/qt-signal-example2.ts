import { Signal, signal, slot } from "./qt-signal2";


const miaowed: string = 'miaowed';
const hovered: string = 'hovered';

class Tom extends Signal {

    @signal(miaowed)    // 自动添加信号 miaowed
    // 定义信号miaowed，参数类型为(id: number, msg: string)
    miaowed: (id: number, msg: string) => void;
    @signal(hovered)    // 自动添加信号 hovered
    // 定义信号hovered，参数类型为(isHovered: boolean)
    hovered: (isHovered: boolean) => void;

    miaow() {
        this.emit(miaowed, 42, "Meow!");  // 此处emit应该自动推断出miaowed的参数类型(id: number, msg: string)
    }

    hover(isHovered: boolean) {
        this.emit(hovered, isHovered);     // 此处emit应该自动推断出hovered的参数类型(isHovered: boolean)
    }
}

class Jerry extends Signal {

    @slot(miaowed)    // 自动添加槽函数 onRunaway, 并关联到 miaowed 信号
    // 定义槽函数onRunaway，参数类型为(id: number, msg: string)
    onRunaway(id: number, msg: string) {
        console.log(this.constructor.name + ' received miaow: ' + id + ', ' + msg);
    }

    @slot(miaowed, { once: true })    // 自动添加槽函数 onRunawayOnce, 并关联到 miaowed 信号，且只执行一次
    // 定义槽函数onRunawayOnce，参数类型为(id: number, msg: string)
    onRunawayOnce(id: number, msg: string) {
        console.log('This will only trigger once:', id, msg);
    }

    @slot(miaowed, { queued: true })
    onRunawayQueued(id: number, msg: string) {
        console.log('This is a queued slot:', id, msg);
    }

    @slot(hovered)
    onHover(isHovered: boolean) {
        console.log(this.constructor.name + ' received hover: ' + (isHovered ? 'true' : 'false'));
    }
}

class Example extends Signal {
    tom: Tom;
    jerry: Jerry;

    test() {
        // 创建信号发射器和槽接收器
        this.tom = new Tom();
        this.jerry = new Jerry();
        // 连接信号和槽函数(多种连接方式示例)
        this.tom.connect(miaowed, this.jerry);
        this.tom.connect(this.jerry.onRunaway, this.jerry);
        
        this.tom.connect(miaowed, this.jerry, { once: true });
        this.tom.connect(hovered, this.jerry, { queued: true });

        console.log('\n--- 触发信号 ---');
        this.tom.miaow();

        console.log('\n--- 再次触发信号（一次性槽函数不会再次执行）---');
        this.tom.miaow();

        console.log('\n--- 触发信号 ---');
        this.tom.hover(true);
        this.tom.hover(false);
    }
}
