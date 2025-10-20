// import { Signal, signal } from './qt-signal';

// class Tom {

//     @signal()
//     public miaowed!: Signal<(id: number, msg: string) => void>;

//     @signal()
//     public hovered!: Signal<(isHovered: boolean) => void>;

//     miaow() {
//         this.miaowed.emit(42, "Meow!");
//     }

//     hover(isHovered: boolean) {
//         this.hovered.emit(isHovered);
//     }
// }

// class Jerry {

//     // 自动连接到this.button对象的clicked信号
//     // @slot(this.button.clicked)
//     onRunaway(id: number, msg: string) {
//         console.log(this.constructor.name + ' received miaow: ' + id + ', ' + msg);
//     }

//     // 自动连接到this.button对象的clicked信号（一次性）
//     // @slot('clicked', this.button, { once: true })
//     onRunawayOnce(id: number, msg: string) {
//         console.log('This will only trigger once:', id, msg);
//     }

//     // 自动连接到this.button对象的clicked信号（队列执行）
//     // @slot('clicked', this.button, { queued: true })
//     onRunawayQueued(id: number, msg: string) {
//         console.log('This is a queued slot:', id, msg);
//     }

//     // 自动连接到this.button对象的hovered信号
//     // @slot('hovered', this.button)
//     onHover(isHovered: boolean) {
//         console.log(this.constructor.name + ' received hover: ' + (isHovered ? 'true' : 'false'));
//     }
// }

// // 使用示例
// const tom = new Tom();
// // 创建接收器时传入按钮对象，无需手动调用connectSignalEmitter
// const jerry = new Jerry();

// tom.miaowed.connect(jerry.onRunaway, jerry);
// tom.miaowed.connect(jerry.onRunawayOnce, jerry, { once: true });
// tom.miaowed.connect(jerry.onRunawayQueued, jerry, { queued: true });
// tom.hovered.connect(jerry.onHover, jerry);

// console.log('\n--- 触发点击信号 ---');
// tom.miaow();

// console.log('\n--- 再次触发点击信号（一次性槽函数不会再次执行）---');
// tom.miaow();

// console.log('\n--- 触发悬停信号 ---');
// tom.hover(true);
// tom.hover(false);