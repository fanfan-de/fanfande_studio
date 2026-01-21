
/*
这是一个非常经典的术语，它的全称是：
**Immediately Invoked Function Expression**
（**立即调用的函数表达式**）
*/ 
export function iife<T>(fn: () => T) {
  return fn()
}
