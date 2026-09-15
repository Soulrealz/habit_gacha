import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { HabitRow } from '../HabitRow';
import type { Habit } from '../../types';

const habit: Habit = {
  id: 'pullups',
  name: 'Pull-ups',
  category: 'gym',
  target: 10,
  unit: 'reps',
  ticketReward: 1,
  quickAdd: [1, 5, 10],
};

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

// Each Text node's own children are concatenated with no separator, so an interpolated
// string like `{count} / {target} {unit}` reads back exactly as rendered. Separate Text
// nodes are then joined with a space.
function textContent(renderer: ReactTestRenderer): string {
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

// Matched on props rather than by component type: Pressable is a wrapped component, so
// findAllByType(Pressable) does not see it. The first node carrying a given label is
// the Pressable itself; the rest are the host views it renders into.
type ButtonProps = { onPress: () => void; disabled?: boolean };

function pressablesByLabel(renderer: ReactTestRenderer): Record<string, ButtonProps> {
  const map: Record<string, ButtonProps> = {};
  for (const node of renderer.root.findAll(
    (instance) =>
      typeof instance.props.accessibilityLabel === 'string' &&
      typeof instance.props.onPress === 'function',
  )) {
    const label = node.props.accessibilityLabel as string;
    if (!(label in map)) {
      map[label] = node.props as ButtonProps;
    }
  }
  return map;
}

describe('HabitRow', () => {
  it('shows the count against the target', () => {
    const renderer = render(
      <HabitRow habit={habit} count={4} completed={false} onAdd={() => {}} />,
    );
    expect(textContent(renderer)).toContain('4 / 10 reps');
  });

  it('marks a completed habit with a tick', () => {
    const incomplete = render(
      <HabitRow habit={habit} count={9} completed={false} onAdd={() => {}} />,
    );
    expect(textContent(incomplete)).not.toContain('✓');

    const complete = render(<HabitRow habit={habit} count={10} completed onAdd={() => {}} />);
    expect(textContent(complete)).toContain('✓');
  });

  it('offers one button per quick-add amount plus an undo', () => {
    const renderer = render(
      <HabitRow habit={habit} count={0} completed={false} onAdd={() => {}} />,
    );
    const labels = Object.keys(pressablesByLabel(renderer));

    expect(labels).toEqual([
      'Add 1 reps to Pull-ups',
      'Add 5 reps to Pull-ups',
      'Add 10 reps to Pull-ups',
      'Remove 1 reps from Pull-ups',
    ]);
  });

  it('reports the amount added', () => {
    const onAdd = jest.fn();
    const renderer = render(<HabitRow habit={habit} count={0} completed={false} onAdd={onAdd} />);

    act(() => {
      pressablesByLabel(renderer)['Add 5 reps to Pull-ups'].onPress();
    });

    expect(onAdd).toHaveBeenCalledWith(5);
  });

  it('reports a negative amount for undo, using the smallest quick-add', () => {
    const onAdd = jest.fn();
    const renderer = render(<HabitRow habit={habit} count={5} completed={false} onAdd={onAdd} />);

    act(() => {
      pressablesByLabel(renderer)['Remove 1 reps from Pull-ups'].onPress();
    });

    expect(onAdd).toHaveBeenCalledWith(-1);
  });

  it('disables every button while a write is in flight', () => {
    const renderer = render(
      <HabitRow habit={habit} count={0} completed={false} disabled onAdd={() => {}} />,
    );

    const buttons = Object.values(pressablesByLabel(renderer));
    expect(buttons).toHaveLength(4);
    for (const props of buttons) {
      expect(props.disabled).toBe(true);
    }
  });

  it('caps the progress bar at full when the count passes the target', () => {
    const renderer = render(<HabitRow habit={habit} count={25} completed onAdd={() => {}} />);
    const fills = renderer.root
      .findAllByType('View' as never)
      .map((node) => node.props.style)
      .flat(Infinity)
      .filter((style) => style && typeof style === 'object' && 'width' in style);

    expect(fills).toContainEqual({ width: '100%' });
  });
});
