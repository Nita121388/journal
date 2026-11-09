/**
 * fsm.test.js — 纯函数状态机原语
 *
 * 守住：合法转移 / 非法事件返回原态且不抛 / 显式自环（null）/ assertMachine 能抓
 * 「initial 不存在」「悬空目标」这两类定义错误。
 */

import { describe, expect, it, vi } from 'vitest';
import { assertMachine, availableEvents, defineMachine, transition } from './fsm.js';

const M = defineMachine({
  id: 'demo',
  initial: 'closed',
  states: {
    closed: { OPEN: 'open' },
    open: { CLOSE: 'closed', PING: null },
  },
});

describe('transition', () => {
  it('合法转移：返回目标态 + changed:true + from', () => {
    expect(transition(M, 'closed', 'OPEN')).toEqual({ state: 'open', from: 'closed', changed: true });
    expect(transition(M, 'open', 'CLOSE')).toEqual({ state: 'closed', from: 'open', changed: true });
  });

  it('未声明的事件：返回原态 + changed:false，且不抛', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(transition(M, 'closed', 'CLOSE')).toEqual({ state: 'closed', from: 'closed', changed: false });
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it('未声明的状态：返回原状态 + changed:false（不抛）', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(transition(M, 'bogus', 'OPEN')).toEqual({ state: 'bogus', from: 'bogus', changed: false });
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it('显式自环（目标 null）：合法事件、状态不变、不 debug', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(transition(M, 'open', 'PING')).toEqual({ state: 'open', from: 'open', changed: false });
    expect(debug).not.toHaveBeenCalled();
    debug.mockRestore();
  });

  it('自环事件（目标 = 自身）：合法、changed:false', () => {
    const S = defineMachine({ id: 'self', initial: 'a', states: { a: { PING: 'a' } } });
    expect(transition(S, 'a', 'PING')).toEqual({ state: 'a', from: 'a', changed: false });
  });

  it('同一事件连续发放：状态按转移表推进', () => {
    let s = M.initial;
    s = transition(M, s, 'OPEN').state;
    expect(s).toBe('open');
    s = transition(M, s, 'CLOSE').state;
    expect(s).toBe('closed');
  });
});

describe('availableEvents', () => {
  it('列出该状态下声明的事件', () => {
    expect(availableEvents(M, 'closed')).toEqual(['OPEN']);
    expect(availableEvents(M, 'open')).toEqual(['CLOSE', 'PING']);
  });

  it('未声明的状态返回空数组', () => {
    expect(availableEvents(M, 'bogus')).toEqual([]);
  });
});

describe('assertMachine', () => {
  it('合法机器返回空错误数组', () => {
    expect(assertMachine(M)).toEqual([]);
  });

  it('抓 initial 不在 states 里', () => {
    const bad = defineMachine({ id: 'bad', initial: 'nope', states: { a: {} } });
    expect(assertMachine(bad)).toEqual(['[fsm:bad] initial「nope」不在 states 里']);
  });

  it('抓悬空目标', () => {
    const bad = defineMachine({ id: 'bad', initial: 'a', states: { a: { GO: 'ghost' } } });
    expect(assertMachine(bad)).toEqual(['[fsm:bad] 状态「a」的事件「GO」指向未声明的目标「ghost」']);
  });

  it('机器定义不完整（缺 states）也报错而不是崩', () => {
    expect(assertMachine({ id: 'x' }).length).toBe(1);
  });
});
