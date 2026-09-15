import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MAX_RANK } from '../services/collection/rank';

/**
 * The two places ranks are shown at once: dense in the collection grid, prominent on the
 * detail screen. Named rather than numeric so neither screen carries pip dimensions —
 * the visual language lives here, and tuning it is one edit rather than two.
 */
const SIZES = {
  small: { diameter: 6, gap: 1.5 },
  large: { diameter: 14, gap: 3 },
} as const;

const EMPTY_COLOUR = '#dee2e6';

type RankPipsProps = {
  /** How many pips are filled. Clamped for display only; the maths lives in rank.ts. */
  rank: number;
  /** Fill colour for earned pips — the character's rarity colour at both call sites. */
  colour: string;
  size?: keyof typeof SIZES;
  testID?: string;
  /** Spacing from the caller's layout. The component owns the pips, not their margins. */
  style?: StyleProp<ViewStyle>;
};

/**
 * A character's rank as a row of pips, filled to the rank they have reached.
 *
 * Extracted because the grid and the detail screen drew this identically and drifted
 * once already: the detail screen shipped without the accessibility label the grid had,
 * so a screen reader announced the rank better on the thumbnail than on the large view.
 * Holding the label here means neither caller can omit it again.
 *
 * `MAX_RANK` is read from the rank module rather than passed in — the number of pips is
 * a property of the ladder, not of whoever is rendering it.
 */
export function RankPips({ rank, colour, size = 'small', testID, style }: RankPipsProps) {
  const { diameter, gap } = SIZES[size];

  return (
    <View
      testID={testID}
      accessibilityLabel={`Rank ${rank} of ${MAX_RANK}`}
      style={[styles.row, style]}
    >
      {Array.from({ length: MAX_RANK }, (_, index) => (
        <View
          key={index}
          style={[
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              marginHorizontal: gap,
            },
            { backgroundColor: index < rank ? colour : EMPTY_COLOUR },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
