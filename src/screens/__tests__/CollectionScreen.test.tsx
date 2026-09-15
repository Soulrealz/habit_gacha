import { CollectionScreen } from '../CollectionScreen';
import { CHARACTERS, RARITY_COLOURS } from '../../data/characters';
import { RANK_THRESHOLDS } from '../../config/gacha';
import { press, pressablesByLabel, renderAndSettle, textContent } from '../../test-utils/render';
import type { OwnedCharacter } from '../../types';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]),
}));

const store = { rows: [] as OwnedCharacter[], fail: false };

jest.mock('../../services/collection', () => ({
  getCollection: async () => {
    if (store.fail) {
      throw new Error('database is locked');
    }
    return store.rows;
  },
}));

function own(characterId: string, copies = 1): OwnedCharacter {
  return { characterId, copies, firstObtainedAt: '2026-09-15T10:00:00.000Z' };
}

beforeEach(() => {
  store.rows = [];
  store.fail = false;
});

// Steps 4 and 5 of the gacha plan's walkthrough (Task 6, Step 3).
describe('Collection screen walkthrough', () => {
  it('step 4: shows the pulled character by name and everything else as a silhouette', async () => {
    const pulled = CHARACTERS[0];
    store.rows = [own(pulled.id)];

    const renderer = await renderAndSettle(<CollectionScreen />);
    const text = textContent(renderer);

    expect(text).toContain(`Collection 1 / ${CHARACTERS.length}`);
    expect(text).toContain(pulled.name);

    // Every other character is hidden behind ???, and none of their names leak.
    const unknowns = text.split('???').length - 1;
    expect(unknowns).toBe(CHARACTERS.length - 1);
    for (const character of CHARACTERS.slice(1)) {
      expect(text).not.toContain(character.name);
    }
  });

  it('step 4: an empty collection shows the whole roster locked', async () => {
    const renderer = await renderAndSettle(<CollectionScreen />);
    const text = textContent(renderer);

    expect(text).toContain(`Collection 0 / ${CHARACTERS.length}`);
    expect(text.split('???').length - 1).toBe(CHARACTERS.length);
  });

  it('step 5: a duplicate shows a copy count', async () => {
    store.rows = [own(CHARACTERS[0].id, 2)];

    const renderer = await renderAndSettle(<CollectionScreen />);

    expect(textContent(renderer)).toContain('×2');
  });

  it('does not show a copy count for a single copy', async () => {
    store.rows = [own(CHARACTERS[0].id, 1)];

    const renderer = await renderAndSettle(<CollectionScreen />);

    expect(textContent(renderer)).not.toContain('×');
  });

  it('counts a character once however many copies are held', async () => {
    store.rows = [own(CHARACTERS[0].id, 5), own(CHARACTERS[1].id, 3)];

    const renderer = await renderAndSettle(<CollectionScreen />);

    expect(textContent(renderer)).toContain(`Collection 2 / ${CHARACTERS.length}`);
  });

  it('never reports owning more than the roster holds', async () => {
    store.rows = [...CHARACTERS.map((character) => own(character.id)), own('retired_01', 4)];

    const renderer = await renderAndSettle(<CollectionScreen />);

    expect(textContent(renderer)).toContain(
      `Collection ${CHARACTERS.length} / ${CHARACTERS.length}`,
    );
  });

  it('tints an owned character by rarity and leaves locked ones grey', async () => {
    const owned = CHARACTERS[0];
    store.rows = [own(owned.id)];

    const renderer = await renderAndSettle(<CollectionScreen />);
    const colours = renderer.root
      .findAll((instance) => typeof instance.props.children === 'string')
      .map((node) => ({
        label: node.props.children as string,
        style: [node.props.style].flat(Infinity).filter(Boolean),
      }));

    const ownedLabel = colours.find((entry) => entry.label === owned.name);
    expect(ownedLabel?.style).toContainEqual({ color: RARITY_COLOURS[owned.rarity] });

    const lockedLabel = colours.find((entry) => entry.label === '???');
    expect(lockedLabel?.style).toContainEqual({ color: '#ced4da' });
  });
});

describe('Collection screen failure handling', () => {
  it('shows the locked roster and says so rather than spinning forever', async () => {
    store.fail = true;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const renderer = await renderAndSettle(<CollectionScreen />);
    const text = textContent(renderer);

    expect(text).toContain('Could not load your collection');
    expect(text).toContain(`Collection 0 / ${CHARACTERS.length}`);

    error.mockRestore();
  });
});

describe('rank on the collection grid', () => {
  it('shows filled pips matching the character rank', async () => {
    const character = CHARACTERS[0];
    store.rows = [own(character.id, RANK_THRESHOLDS[character.rarity][1])];

    const renderer = await renderAndSettle(<CollectionScreen />);
    const pips = renderer.root.findAllByProps({ testID: `pips-${character.id}` });

    expect(pips[0].props.accessibilityLabel).toBe('Rank 2 of 5');
  });

  it('opens the character when an owned cell is pressed', async () => {
    const character = CHARACTERS[0];
    store.rows = [own(character.id)];
    const onOpen = jest.fn();

    const renderer = await renderAndSettle(<CollectionScreen onOpen={onOpen} />);
    await press(renderer, `Open ${character.name}`);

    expect(onOpen).toHaveBeenCalledWith(character.id);
  });

  it('does not offer to open a character that is not owned', async () => {
    const renderer = await renderAndSettle(<CollectionScreen onOpen={jest.fn()} />);

    expect(Object.keys(pressablesByLabel(renderer))).toHaveLength(0);
  });
});
