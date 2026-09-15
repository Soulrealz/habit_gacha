import { Text } from 'react-native';
import { RankBorder } from '../RankBorder';
import { render } from '../../test-utils/render';

describe('RankBorder', () => {
  it('renders its child inside a frame tinted by the given colour', () => {
    const renderer = render(
      <RankBorder colour="#f59f00">
        <Text>inside</Text>
      </RankBorder>,
    );

    const frame = renderer.root.findByProps({ testID: 'rank-border' });
    expect([frame.props.style].flat(Infinity)).toContainEqual({ borderColor: '#f59f00' });
    expect(renderer.root.findByType(Text).props.children).toBe('inside');
  });
});
