import { jest } from '@jest/globals';

describe('trackEvent', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('logs event when analytics is defined', () => {
    const logEvent = jest.fn();
    const warn = jest.fn();

    jest.doMock('firebase/analytics', () => ({ logEvent }));
    jest.doMock('@/shared/logger', () => ({ warn }));
    const analyticsInstance = {};
    jest.doMock('@/firebase', () => ({ analytics: analyticsInstance }));

    const { trackEvent } = require('@/helpers/analytics');
    trackEvent('test_event', { foo: 'bar' });

    expect(logEvent).toHaveBeenCalledWith(analyticsInstance, 'test_event', { foo: 'bar' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when analytics is undefined', () => {
    const logEvent = jest.fn();
    const warn = jest.fn();

    jest.doMock('firebase/analytics', () => ({ logEvent }));
    jest.doMock('@/shared/logger', () => ({ warn }));
    jest.doMock('@/firebase', () => ({ analytics: undefined }));

    const { trackEvent } = require('@/helpers/analytics');
    trackEvent('test_event');

    expect(logEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Analytics not ready');
  });
});

