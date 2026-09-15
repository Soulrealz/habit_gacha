import { CharacterDetailScreen } from '../CharacterDetailScreen';
import { CHARACTERS } from '../../data/characters';
import { RANK_THRESHOLDS } from '../../config/gacha';
import { MAX_RANK } from '../../services/collection/rank';
import { renderAndSettle, textContent } from '../../test-utils/render';
import type { OwnedCharacter } from '../../types';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]),
}));

// Holds per-test overrides for the rank constants. Must be "mock"-prefixed:
// babel-plugin-jest-hoist rejects out-of-scope references from a hoisted jest.mock
// factory otherwise. The factory below only closes over this object — it does not read
// it until a getter is actually invoked at render time, by which point the object is
// initialised, so the hoisting above the import statements is harmless.
const mockRankOverrides: { MAX_RANK?: number; ART_RANK?: number } = {};

jest.mock('../../services/collection/rank', () => {
  const actual = jest.requireActual('../../services/collection/rank');
  // Built with defineProperty, not object-spread-of-getters: TypeScript's object-spread
  // downlevel copies by value (invoking any getter immediately to read it), which would
  // run this getter at module-load time — before `mockRankOverrides` below is
  // initialised — and throw. defineProperty attaches a real lazy accessor instead.
  const mocked = { ...actual };
  Object.defineProperty(mocked, 'MAX_RANK', {
    enumerable: true,
    get: () => mockRankOverrides.MAX_RANK ?? actual.MAX_RANK,
  });
  Object.defineProperty(mocked, 'ART_RANK', {
    enumerable: true,
    get: () => mockRankOverrides.ART_RANK ?? actual.ART_RANK,
  });
  return mocked;
});

const store = { rows: [] as OwnedCharacter[], fail: false };
const settings = { showBorders: true };

jest.mock('../../services/collection', () => ({
  getCollection: async () => {
    if (store.fail) {
      throw new Error('database is locked');
    }
    return store.rows;
  },
}));

jest.mock('../../services/settings', () => ({
  getShowRankBorders: async () => settings.showBorders,
}));

const character = CHARACTERS[0];
const thresholds = RANK_THRESHOLDS[character.rarity];

function own(copies: number): OwnedCharacter {
  return { characterId: character.id, copies, firstObtainedAt: '2026-09-16T10:00:00.000Z' };
}

function renderAt(copies: number) {
  store.rows = [own(copies)];
  return renderAndSettle(
    <CharacterDetailScreen route={{ params: { characterId: character.id } }} />,
  );
}

beforeEach(() => {
  store.rows = [];
  store.fail = false;
  settings.showBorders = true;
});

describe('character detail', () => {
  it('shows the name and copy count', async () => {
    const text = textContent(await renderAt(3));

    expect(text).toContain(character.name);
    expect(text).toContain('3 copies');
  });

  it('uses the singular for exactly one copy', async () => {
    const text = textContent(await renderAt(1));

    expect(text).toContain('1 copy');
    expect(text).not.toContain('1 copies');
  });

  it('uses the plural for zero copies', async () => {
    const text = textContent(await renderAt(0));

    expect(text).toContain('0 copies');
  });

  it('says how many more copies the next rank needs', async () => {
    const text = textContent(await renderAt(1));

    expect(text).toContain(`${thresholds[0] - 1} more`);
  });

  // Locked entries are shown as locked rather than hidden: seeing there is something
  // left to earn is the whole motivational point of the ladder.
  it('shows locked lore as locked rather than hiding it', async () => {
    const text = textContent(await renderAt(1));

    expect(text).not.toContain(character.lore[0]);
    expect(text.split('Locked').length - 1).toBe(3);
  });

  it('reveals one lore entry per rank', async () => {
    const text = textContent(await renderAt(thresholds[1]));

    expect(text).toContain(character.lore[0]);
    expect(text).toContain(character.lore[1]);
    expect(text).not.toContain(character.lore[2]);
  });

  it('says there is nothing left to earn at max rank', async () => {
    const text = textContent(await renderAt(thresholds[MAX_RANK - 1]));

    expect(text).toContain('Fully ranked');
    expect(text).not.toContain('more to Rank');
  });
});

describe('the alternate artwork', () => {
  it('shows the base sprite below max rank', async () => {
    const renderer = await renderAt(thresholds[MAX_RANK - 2]);
    const art = renderer.root.findByProps({ testID: 'detail-art' });

    expect(art.props.source).toBe(character.sprite);
  });

  it('swaps to the alternate sprite at max rank', async () => {
    const renderer = await renderAt(thresholds[MAX_RANK - 1]);
    const art = renderer.root.findByProps({ testID: 'detail-art' });

    expect(art.props.source).toBe(character.altSprite);
  });
});

// Regression test: the artwork must be gated on ART_RANK, not MAX_RANK. Widening the
// ladder (a future R6) must not silently move the alternate artwork or strand it behind
// an unreachable rank. Scoped to its own describe with its own beforeEach/afterEach so
// it does not disturb the real-threshold tests above and below it.
describe('the alternate artwork, with ART_RANK distinct from MAX_RANK', () => {
  beforeEach(() => {
    mockRankOverrides.MAX_RANK = 6;
    mockRankOverrides.ART_RANK = 5;
  });

  afterEach(() => {
    delete mockRankOverrides.MAX_RANK;
    delete mockRankOverrides.ART_RANK;
  });

  it('swaps to the alternate sprite at ART_RANK even though MAX_RANK is higher', async () => {
    // Real thresholds only go up to real rank 5 — reaching it is reaching ART_RANK (5),
    // well short of the mocked MAX_RANK (6).
    const renderer = await renderAt(thresholds[4]);
    const art = renderer.root.findByProps({ testID: 'detail-art' });

    expect(art.props.source).toBe(character.altSprite);
  });
});

describe('the rank border', () => {
  const borderRank = RANK_THRESHOLDS[character.rarity][3]; // R4

  it('is absent below R4', async () => {
    const renderer = await renderAt(RANK_THRESHOLDS[character.rarity][2]);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' })).toHaveLength(0);
  });

  it('appears at R4', async () => {
    const renderer = await renderAt(borderRank);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' }).length).toBeGreaterThan(0);
  });

  it('is still drawn at max rank, alongside the alternate art', async () => {
    const renderer = await renderAt(RANK_THRESHOLDS[character.rarity][MAX_RANK - 1]);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' }).length).toBeGreaterThan(0);
  });

  it('is hidden when the global setting is off', async () => {
    settings.showBorders = false;
    const renderer = await renderAt(borderRank);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' })).toHaveLength(0);
  });
});

describe('character detail failure handling', () => {
  it('shows the failure banner and falls back to the rank-0 state', async () => {
    store.fail = true;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const renderer = await renderAndSettle(
      <CharacterDetailScreen route={{ params: { characterId: character.id } }} />,
    );
    const text = textContent(renderer);

    expect(text).toContain('Could not read your copies');
    expect(text).toContain(character.name);
    expect(text).toContain('0 copies');
    expect(text.split('Locked').length - 1).toBe(3);

    error.mockRestore();
  });
});
