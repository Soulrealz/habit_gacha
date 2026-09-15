// Shared helpers for screen tests. Not inside a `__tests__` folder on purpose — jest
// treats everything in those as a test file.
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

export function render(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

/** Renders, then flushes the effects and promises a focus-effect data load kicks off. */
export async function renderAndSettle(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

/** Lets every pending promise and the state updates they cause resolve. */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

// Each Text node's own children are concatenated with no separator, so an interpolated
// string like `{count} / {target} {unit}` reads back exactly as rendered. Separate Text
// nodes are joined with a space.
export function textContent(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) =>
      [node.props.children]
        .flat(Infinity)
        .filter((child) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join(' ');
}

export type ButtonProps = { onPress: () => void; disabled?: boolean };

// Matched on props rather than by component type: Pressable is a wrapped component, so
// findAllByType(Pressable) does not see it. The first node carrying a given label is the
// Pressable itself; the rest are the host views it renders into.
export function pressablesByLabel(renderer: ReactTestRenderer): Record<string, ButtonProps> {
  const map: Record<string, ButtonProps> = {};
  for (const node of renderer.root.findAll(isPressable)) {
    const label = node.props.accessibilityLabel as string;
    if (!(label in map)) {
      map[label] = node.props as ButtonProps;
    }
  }
  return map;
}

function isPressable(instance: ReactTestInstance): boolean {
  return (
    typeof instance.props.accessibilityLabel === 'string' &&
    typeof instance.props.onPress === 'function'
  );
}

/** Presses a button by accessibility label and waits for the work it starts. */
export async function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  const button = pressablesByLabel(renderer)[label];
  if (!button) {
    throw new Error(
      `No pressable labelled "${label}". Available: ${Object.keys(pressablesByLabel(renderer)).join(', ')}`,
    );
  }
  await act(async () => {
    button.onPress();
  });
  await settle();
}
