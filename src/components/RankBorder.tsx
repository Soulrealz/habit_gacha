import { StyleSheet, View } from 'react-native';

type RankBorderProps = {
  colour: string;
  children: React.ReactNode;
};

/**
 * The R4 unlock. Code-drawn rather than an asset, which is what keeps this feature's
 * whole art bill to one extra piece per character.
 */
export function RankBorder({ colour, children }: RankBorderProps) {
  return (
    <View testID="rank-border" style={[styles.frame, { borderColor: colour }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 3,
    borderRadius: 12,
    padding: 8,
  },
});
