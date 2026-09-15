import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { useCurrentDate } from '../useCurrentDate';

function Probe() {
  return <Text>{useCurrentDate()}</Text>;
}

function shown(renderer: ReactTestRenderer): string {
  return renderer.root.findByType(Text).props.children as string;
}

function render(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

/** Captures the AppState listener the hook registers, so a test can fire it. */
function captureAppStateListener(): { fire: (state: string) => void; remove: jest.Mock } {
  const remove = jest.fn();
  let listener: ((state: string) => void) | undefined;

  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    handler: (state: string) => void,
  ) => {
    listener = handler;
    return { remove };
  }) as never);

  return {
    fire: (state: string) => listener?.(state),
    remove,
  };
}

describe('useCurrentDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 15, 23, 59, 50, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts on the current local date', () => {
    expect(shown(render())).toBe('2026-09-15');
  });

  it('does not change before midnight', () => {
    const renderer = render();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(shown(renderer)).toBe('2026-09-15');
  });

  it('changes when the clock passes midnight', () => {
    const renderer = render();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(shown(renderer)).toBe('2026-09-16');
  });

  it('re-arms for the following midnight', () => {
    const renderer = render();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(shown(renderer)).toBe('2026-09-16');

    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(shown(renderer)).toBe('2026-09-17');
  });

  it('catches up when the app returns to the foreground', () => {
    const appState = captureAppStateListener();
    const renderer = render();
    expect(shown(renderer)).toBe('2026-09-15');

    // The phone was asleep: the clock moved but no timer fired.
    jest.setSystemTime(new Date(2026, 8, 16, 8, 0, 0, 0));
    act(() => {
      appState.fire('active');
    });

    expect(shown(renderer)).toBe('2026-09-16');
  });

  it('ignores a transition to the background', () => {
    const appState = captureAppStateListener();
    const renderer = render();

    jest.setSystemTime(new Date(2026, 8, 16, 8, 0, 0, 0));
    act(() => {
      appState.fire('background');
    });

    expect(shown(renderer)).toBe('2026-09-15');
  });

  it('clears its timer and subscription on unmount', () => {
    const appState = captureAppStateListener();
    const renderer = render();

    act(() => {
      renderer.unmount();
    });

    expect(appState.remove).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
