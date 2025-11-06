import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccountabilityCircles } from '@/hooks/useAccountabilityCircles';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockScheduleCircleReminder = jest.fn();
const mockCancelCircleReminder = jest.fn();

jest.mock('@/helpers/reminders', () => ({
  scheduleCircleReminder: (...args: unknown[]) =>
    mockScheduleCircleReminder(...args),
  cancelCircleReminder: (...args: unknown[]) =>
    mockCancelCircleReminder(...args),
}));

jest.mock('@/helpers/analytics', () => ({
  trackEvent: jest.fn(),
}));

describe('useAccountabilityCircles', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockScheduleCircleReminder.mockResolvedValue({
      id: 'rem-1',
      triggerAt: Date.now() + 1000,
    });
    mockCancelCircleReminder.mockResolvedValue(undefined);
  });

  it('creates a circle and persists it to storage', async () => {
    const { result } = renderHook(() => useAccountabilityCircles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: any;
    await act(async () => {
      created = await result.current.createCircle('Focus Buddies', 3);
    });

    expect(created).toBeTruthy();
    expect(result.current.circles).toHaveLength(1);
    expect(result.current.circles[0]).toMatchObject({
      name: 'Focus Buddies',
      cadenceDays: 3,
    });
    expect(mockScheduleCircleReminder).toHaveBeenCalledTimes(1);

    const stored = await AsyncStorage.getItem('accountability.circles.v1');
    expect(stored).toContain('Focus Buddies');
  });

  it('updates cadence and reschedules reminders', async () => {
    const { result } = renderHook(() => useAccountabilityCircles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let createdId: string | undefined;
    mockScheduleCircleReminder.mockResolvedValueOnce({
      id: 'rem-create',
      triggerAt: Date.now() + 1,
    });

    await act(async () => {
      const created = await result.current.createCircle('Deep Work', 2);
      createdId = created?.id;
    });

    expect(createdId).toBeDefined();
    mockScheduleCircleReminder.mockResolvedValueOnce({
      id: 'rem-update',
      triggerAt: Date.now() + 2,
    });

    await act(async () => {
      if (createdId) {
        await result.current.updateCircle(createdId, { cadenceDays: 5 });
      }
    });

    expect(mockCancelCircleReminder).toHaveBeenCalledWith('rem-create');
    expect(mockScheduleCircleReminder).toHaveBeenCalledTimes(2);
    expect(result.current.circles[0]).toMatchObject({ cadenceDays: 5 });
  });

  it('deletes circles and cancels reminders', async () => {
    const { result } = renderHook(() => useAccountabilityCircles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let createdId: string | undefined;
    mockScheduleCircleReminder.mockResolvedValueOnce({
      id: 'rem-delete',
      triggerAt: Date.now() + 1,
    });

    await act(async () => {
      const created = await result.current.createCircle(
        'Accountability Crew',
        4,
      );
      createdId = created?.id;
    });

    await act(async () => {
      if (createdId) {
        await result.current.deleteCircle(createdId);
      }
    });

    expect(mockCancelCircleReminder).toHaveBeenCalledWith('rem-delete');
    expect(result.current.circles).toHaveLength(0);
  });
});
