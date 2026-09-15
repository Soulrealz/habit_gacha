import { View } from 'react-native';
import { RankPips } from '../RankPips';
import { MAX_RANK } from '../../services/collection/rank';
import { render } from '../../test-utils/render';

const COLOUR = '#f59f00';
const EMPTY = '#dee2e6';

/** Every pip's flattened style, in render order. The container is the first View. */
function pipStyles(renderer: ReturnType<typeof render>) {
  return renderer.root
    .findAllByType(View)
    .slice(1)
    .map((node) => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean)));
}

describe('RankPips', () => {
  it('always renders one pip per rank on the ladder, however low the rank', () => {
    expect(pipStyles(render(<RankPips rank={0} colour={COLOUR} />))).toHaveLength(MAX_RANK);
    expect(pipStyles(render(<RankPips rank={MAX_RANK} colour={COLOUR} />))).toHaveLength(MAX_RANK);
  });

  it('fills exactly `rank` pips and leaves the rest empty', () => {
    const styles = pipStyles(render(<RankPips rank={2} colour={COLOUR} />));

    expect(styles.map((style) => style.backgroundColor)).toEqual([
      COLOUR,
      COLOUR,
      EMPTY,
      EMPTY,
      EMPTY,
    ]);
  });

  it('fills none at rank 0 and all at max rank', () => {
    const none = pipStyles(render(<RankPips rank={0} colour={COLOUR} />));
    expect(none.every((style) => style.backgroundColor === EMPTY)).toBe(true);

    const all = pipStyles(render(<RankPips rank={MAX_RANK} colour={COLOUR} />));
    expect(all.every((style) => style.backgroundColor === COLOUR)).toBe(true);
  });

  // The label is the whole reason this is one component rather than two blocks: the
  // detail screen shipped without it once already, announcing the rank worse on the big
  // view than on the thumbnail.
  it('announces the rank, so neither caller can forget to', () => {
    const renderer = render(<RankPips rank={3} colour={COLOUR} />);

    expect(renderer.root.findAllByType(View)[0].props.accessibilityLabel).toBe(
      `Rank 3 of ${MAX_RANK}`,
    );
  });

  it('passes a testID through when one is given, and omits it otherwise', () => {
    const withId = render(<RankPips rank={1} colour={COLOUR} testID="pips-aria_01" />);
    expect(withId.root.findAllByType(View)[0].props.testID).toBe('pips-aria_01');

    const without = render(<RankPips rank={1} colour={COLOUR} />);
    expect(without.root.findAllByType(View)[0].props.testID).toBeUndefined();
  });

  it('draws larger pips on the detail screen than in the grid', () => {
    const small = pipStyles(render(<RankPips rank={1} colour={COLOUR} size="small" />))[0];
    const large = pipStyles(render(<RankPips rank={1} colour={COLOUR} size="large" />))[0];

    expect(large.width).toBeGreaterThan(small.width);
    expect(small.borderRadius).toBe(small.width / 2);
    expect(large.borderRadius).toBe(large.width / 2);
  });

  it('defaults to the small size, which is the denser of the two callers', () => {
    const explicit = pipStyles(render(<RankPips rank={1} colour={COLOUR} size="small" />))[0];
    const implicit = pipStyles(render(<RankPips rank={1} colour={COLOUR} />))[0];

    expect(implicit.width).toBe(explicit.width);
  });
});
