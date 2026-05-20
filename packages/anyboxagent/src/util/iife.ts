/*
（**立即调用的函数表达式**）
*/ 
export function iife<T>(fn: () => T) {
  return fn()
}
