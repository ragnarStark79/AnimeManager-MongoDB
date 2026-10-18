import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDetailDraft,
  normalizeSearchCandidates,
} from '../dist/services/import/normalizer.js';

test('Normalizer: Normalizes comprehensive Anime detail response', () => {
  const rawJikanAnime = {
    data: {
      mal_id: 5114,
      title: 'Fullmetal Alchemist: Brotherhood',
      title_english: 'Fullmetal Alchemist: Brotherhood',
      title_japanese: '鋼の錬金術師 FULLMETAL ALCHEMIST',
      title_synonyms: ['Hagane no Renkinjutsushi: Fullmetal Alchemist', 'FMA'],
      type: 'TV',
      episodes: 64,
      status: 'Finished Airing',
      aired: {
        from: '2009-04-05T00:00:00+00:00',
        to: '2010-07-04T00:00:00+00:00',
      },
      score: 9.1,
      rank: 1,
      popularity: 3,
      synopsis: 'Two alchemist brothers seek the Philosopher Stone. [Written by MAL Rewrite]',
      background: 'Adapts the entire manga series faithfully.',
      images: {
        webp: {
          large_image_url: 'https://cdn.myanimelist.net/images/anime/1223/96541l.webp',
        },
      },
      genres: [{ name: 'Action' }, { name: 'Adventure' }, { name: 'Fantasy' }],
      themes: [{ name: 'Military' }],
      demographics: [{ name: 'Shounen' }],
      // Extraneous community review data present in payload
      reviews: [{ reviewer: 'user_1', text: 'Best anime ever!' }],
    },
  };

  const draft = normalizeDetailDraft(rawJikanAnime, 'anime');

  assert.equal(draft.provider, 'myanimelist');
  assert.equal(draft.externalId, '5114');
  assert.equal(draft.mediaType, 'anime');
  assert.equal(draft.needsMediaConfirmation, false);
  assert.equal(draft.englishTitle, 'Fullmetal Alchemist: Brotherhood');
  assert.equal(draft.originalTitle, '鋼の錬金術師 FULLMETAL ALCHEMIST');
  assert.equal(draft.episodeCount, 64);
  assert.equal(draft.releaseYear, 2009);
  assert.equal(draft.startDate, '2009-04-05');
  assert.equal(draft.endDate, '2010-07-04');
  assert.equal(draft.sourceScore, 9.1);
  assert.equal(draft.sourceRank, 1);
  assert.equal(draft.sourcePopularity, 3);
  assert.equal(
    draft.synopsis,
    'Two alchemist brothers seek the Philosopher Stone.'
  ); // MAL Rewrite stripped cleanly!
  assert.equal(draft.background, 'Adapts the entire manga series faithfully.');
  assert.equal(draft.coverUrl, 'https://cdn.myanimelist.net/images/anime/1223/96541l.webp');

  // Genres & Tags
  assert.deepEqual(draft.genres, ['Action', 'Adventure', 'Fantasy']);
  assert.deepEqual(draft.tags, ['Military', 'Shounen']);

  // Reviews strictly excluded
  assert.equal('reviews' in draft, false);
});

test('Normalizer: Explicitly identifies Manhwa format', () => {
  const rawJikanManhwa = {
    data: {
      mal_id: 121496,
      title: 'Solo Leveling',
      title_english: 'Solo Leveling',
      title_japanese: '나 혼자만 레벨업',
      type: 'Manhwa',
      chapters: 200,
      status: 'Finished',
      score: 8.7,
      genres: [{ name: 'Action' }, { name: 'Fantasy' }],
      published: {
        from: '2018-03-04T00:00:00+00:00',
      },
    },
  };

  const draft = normalizeDetailDraft(rawJikanManhwa, 'manga');
  assert.equal(draft.mediaType, 'manhwa');
  assert.equal(draft.needsMediaConfirmation, false);
  assert.equal(draft.chapterCount, 200);
});

test('Normalizer: Flags ambiguous manga/manhwa with warning and confirmation requirement', () => {
  const rawJikanAmbiguous = {
    data: {
      mal_id: 8888,
      title: 'Tower of God',
      type: 'Webtoon', // Ambiguous upstream type
      genres: [{ name: 'Fantasy' }],
    },
  };

  const draft = normalizeDetailDraft(rawJikanAmbiguous, 'manga');
  assert.equal(draft.mediaType, 'manga');
  assert.equal(draft.needsMediaConfirmation, true);
  assert.ok(draft.warnings.some((w) => w.includes('Please confirm whether this title is Manga or Manhwa')));
});

test('Normalizer: Safely handles null, missing, and malformed upstream fields', () => {
  const sparsePayload = {
    data: {
      mal_id: 999,
      title: 'Minimal Title',
      aired: null,
      score: 'invalid_number',
      synopsis: null,
      images: null,
    },
  };

  const draft = normalizeDetailDraft(sparsePayload, 'anime');
  assert.equal(draft.externalId, '999');
  assert.equal(draft.englishTitle, 'Minimal Title');
  assert.equal(draft.originalTitle, null);
  assert.equal(draft.synopsis, null);
  assert.equal(draft.sourceScore, null);
  assert.equal(draft.coverUrl, null);
  assert.ok(draft.warnings.length > 0);
});

test('Normalizer: Deduplicates aliases, genres, and tags', () => {
  const rawData = {
    data: {
      mal_id: 1,
      title: 'Demon Slayer',
      title_english: 'Demon Slayer',
      title_synonyms: ['Kimetsu no Yaiba', 'kimetsu no yaiba', 'Demon Slayer'],
      genres: [{ name: 'Action' }, { name: 'Action' }, { name: 'Fantasy' }],
      themes: [{ name: 'Historical' }],
      demographics: [{ name: 'Historical' }, { name: 'Shounen' }],
    },
  };

  const draft = normalizeDetailDraft(rawData, 'anime');
  // Aliases should contain 'Kimetsu no Yaiba' once (Demon Slayer is main title)
  assert.equal(draft.aliases.length, 1);
  assert.equal(draft.aliases[0].title, 'Kimetsu no Yaiba');

  // Genres should be unique
  assert.deepEqual(draft.genres, ['Action', 'Fantasy']);

  // Tags should be unique
  assert.deepEqual(draft.tags, ['Historical', 'Shounen']);
});

test('Normalizer: Normalizes search candidate lists', () => {
  const rawCandidates = [
    {
      mal_id: 1,
      title: 'Cowboy Bebop',
      title_english: 'Cowboy Bebop',
      type: 'TV',
      score: 8.75,
      synopsis: 'In the year 2071, humanity has colonized space...',
    },
    {
      mal_id: 2,
      title: 'Solo Leveling',
      type: 'Manhwa',
      score: 8.69,
      synopsis: 'Ten years ago, the Gate opened...',
    },
  ];

  const results = normalizeSearchCandidates(rawCandidates, 'manga');
  assert.equal(results.length, 2);
  assert.equal(results[0].malId, 1);
  assert.equal(results[0].mediaType, 'manga');
  assert.equal(results[1].malId, 2);
  assert.equal(results[1].mediaType, 'manhwa'); // Disambiguated in candidate list
});
