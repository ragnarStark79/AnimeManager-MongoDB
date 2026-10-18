import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mediaTypeSchema,
  bookmarkStatusSchema,
  titleCreateSchema,
  collectionCreateSchema,
  bookmarkCreateSchema,
} from '../dist/index.js';

test('mediaTypeSchema validates valid media types', () => {
  assert.equal(mediaTypeSchema.parse('anime'), 'anime');
  assert.equal(mediaTypeSchema.parse('manga'), 'manga');
  assert.equal(mediaTypeSchema.parse('manhwa'), 'manhwa');
  assert.throws(() => mediaTypeSchema.parse('cartoon'), /Invalid/);
});

test('bookmarkStatusSchema validates valid statuses', () => {
  assert.equal(bookmarkStatusSchema.parse('plan_to_consume'), 'plan_to_consume');
  assert.equal(bookmarkStatusSchema.parse('consuming'), 'consuming');
  assert.equal(bookmarkStatusSchema.parse('completed'), 'completed');
  assert.equal(bookmarkStatusSchema.parse('on_hold'), 'on_hold');
  assert.equal(bookmarkStatusSchema.parse('dropped'), 'dropped');
  assert.throws(() => bookmarkStatusSchema.parse('watching'), /Invalid/);
});

test('titleCreateSchema enforces required display title and valid values', () => {
  const valid = {
    mediaType: 'anime',
    englishTitle: 'Attack on Titan',
    releaseYear: 2013,
    episodeCount: 25,
  };
  const parsed = titleCreateSchema.parse(valid);
  assert.equal(parsed.englishTitle, 'Attack on Titan');
  assert.equal(parsed.mediaType, 'anime');

  // Blank title rejected
  assert.throws(() => titleCreateSchema.parse({ mediaType: 'anime', englishTitle: '   ' }));

  // Negative episode count rejected
  assert.throws(() => titleCreateSchema.parse({
    mediaType: 'anime',
    englishTitle: 'Naruto',
    episodeCount: -5,
  }));
});

test('collectionCreateSchema trims names and rejects blanks', () => {
  const parsed = collectionCreateSchema.parse({ name: '  Favorites  ' });
  assert.equal(parsed.name, 'Favorites');

  assert.throws(() => collectionCreateSchema.parse({ name: '' }));
  assert.throws(() => collectionCreateSchema.parse({ name: '    ' }));
});

test('bookmarkCreateSchema rejects negative progress and out-of-range rating', () => {
  const valid = {
    titleId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'consuming',
    progress: 12,
    personalRating: 9.5,
  };
  const parsed = bookmarkCreateSchema.parse(valid);
  assert.equal(parsed.progress, 12);
  assert.equal(parsed.personalRating, 9.5);

  // Negative progress rejected
  assert.throws(() => bookmarkCreateSchema.parse({
    ...valid,
    progress: -1,
  }));

  // Personal rating > 10 rejected
  assert.throws(() => bookmarkCreateSchema.parse({
    ...valid,
    personalRating: 11,
  }));

  // Personal rating < 0 rejected
  assert.throws(() => bookmarkCreateSchema.parse({
    ...valid,
    personalRating: -0.5,
  }));
});
