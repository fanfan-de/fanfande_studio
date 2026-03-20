
一个session。是由多次的小循环组成

一个小循环的起点是usermessage，终点是不带有参数调用的assistantmessage

每个instance处有一个record，用来存运行时当前的sessionId，以及对应的 打断方法，回调方法，当一个sesssion执行完之后，会执行存在这里的回调

每一个loop执行的就是这样一个小循环（循环中可能会设计多次的回调）



详解callbacks 队列等待机制是如何实现的

