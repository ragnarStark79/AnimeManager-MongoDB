import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  getDb,
  getMongoClient,
  initIndexes,
  setTestDbName,
  closeMongo,
  checkHealthDetailed,
  getTitlesCollection,
  getCollectionsCollection,
  getBookmarksCollection,
} from '../dist/repositories/mongo.js';
import { collectionsRepository } from '../dist/repositories/collections.repository.js';
import { titlesRepository } from '../dist/repositories/titles.repository.js';
import { bookmarksRepository } from '../dist/repositories/bookmarks.repository.js';
import { importService } from '../dist/services/import/import.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, DuplicateImportError } from '../dist/errors/index.js';

const TEST_DB = 'animemanager_phase03_test';
const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';

before(async () => {
  setTestDbName(TEST_DB);
  const db = await getDb();
  await db.dropDatabase();
  await initIndexes(db);
});

after(async () => {
  try {
    const db = await getDb();
    await db.dropDatabase();
  } finally {
    await closeMongo();
  }
});

describe('MongoDB Connection & Health Check', () => {
  test('checkHealthDetailed reports connected, sanitized URI, and collection schema readiness', async () => {
    const health = await checkHealthDetailed();
    assert.equal(health.connected, true);
    assert.ok(health.sanitizedHost.includes('127.0.0.1') || health.sanitizedHost.includes('localhost'));
    assert.ok(!health.sanitizedHost.includes('password'));
    assert.equal(health.schemaReady, true);
    assert.ok(health.collectionsCount >= 3);
  });

  test('initIndexes is idempotent and can be run multiple times safely', async () => {
    const db = await getDb();
    await initIndexes(db);
    await initIndexes(db);
    assert.ok(true, 'Idempotent index creation completed without error');
  });
});

describe('Safeguard: Collection-Name Uniqueness & Normalization', () => {
  test('Trims whitespace and saves display name with normalized lookup', async () => {
    const col = await collectionsRepository.create(USER_A, {
      name: '  Action Shonen  ',
      description: 'High octane battles',
    });
    assert.equal(col.name, 'Action Shonen');

    const fetched = await collectionsRepository.findById(USER_A, col.id);
    assert.ok(fetched);
    assert.equal(fetched.name, 'Action Shonen');
  });

  test('Rejects duplicate normalized collection name under same owner (case & whitespace insensitive)', async () => {
    // Exact same
    await assert.rejects(
      async () => {
        await collectionsRepository.create(USER_A, { name: 'Action Shonen' });
      },
      (err) => err instanceof ConflictError && err.message.includes('already exists')
    );

    // Different case & extra whitespace
    await assert.rejects(
      async () => {
        await collectionsRepository.create(USER_A, { name: '   action shonen   ' });
      },
      (err) => err instanceof ConflictError
    );
  });

  test('Permits identical collection name under a different owner (tenant isolation)', async () => {
    const colB = await collectionsRepository.create(USER_B, {
      name: 'action shonen',
    });
    assert.ok(colB.id);
    assert.equal(colB.name, 'action shonen');
    assert.equal(colB.ownerId, USER_B);
  });

  test('Rejects empty names and names that become empty after trimming', async () => {
    await assert.rejects(
      async () => {
        await collectionsRepository.create(USER_A, { name: '   ' });
      },
      (err) => err instanceof ValidationError
    );
  });
});

describe('Safeguard: Collection Membership & Counters', () => {
  let titleA1;
  let titleA2;
  let titleB1;
  let testCollection;

  before(async () => {
    titleA1 = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Attack on Titan',
    });
    titleA2 = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Fullmetal Alchemist: Brotherhood',
    });
    titleB1 = await titlesRepository.create(USER_B, {
      mediaType: 'anime',
      englishTitle: 'Steins;Gate',
    });

    testCollection = await collectionsRepository.create(USER_A, {
      name: 'All-Time Greats',
    });
  });

  test('Adding a new title increments titleCount and appends to items', async () => {
    await collectionsRepository.addTitles(USER_A, testCollection.id, [titleA1.id]);

    const col = await collectionsRepository.findById(USER_A, testCollection.id);
    assert.ok(col);
    assert.equal(col.titleCount, 1);
    assert.equal(col.titles.length, 1);
    assert.equal(col.titles[0].id, titleA1.id);
  });

  test('Adding the same title twice does not create duplicate membership or drift titleCount', async () => {
    // Add same title again
    await collectionsRepository.addTitles(USER_A, testCollection.id, [titleA1.id]);

    const col = await collectionsRepository.findById(USER_A, testCollection.id);
    assert.ok(col);
    assert.equal(col.titleCount, 1, 'titleCount must remain 1');
    assert.equal(col.titles.length, 1, 'items array must remain length 1');
  });

  test('Adding a second distinct title increments titleCount to 2', async () => {
    await collectionsRepository.addTitles(USER_A, testCollection.id, [titleA2.id]);

    const col = await collectionsRepository.findById(USER_A, testCollection.id);
    assert.ok(col);
    assert.equal(col.titleCount, 2);
    assert.equal(col.titles.length, 2);
  });

  test('Removing an existing title decrements titleCount and removes from items', async () => {
    const removed = await collectionsRepository.removeTitle(USER_A, testCollection.id, titleA1.id);
    assert.equal(removed, true);

    const col = await collectionsRepository.findById(USER_A, testCollection.id);
    assert.ok(col);
    assert.equal(col.titleCount, 1);
    assert.equal(col.titles.length, 1);
    assert.equal(col.titles[0].id, titleA2.id);
  });

  test('Removing a nonexistent title returns false and does not decrement titleCount', async () => {
    const fakeTitleId = randomUUID();
    const removed = await collectionsRepository.removeTitle(USER_A, testCollection.id, fakeTitleId);
    assert.equal(removed, false);

    const col = await collectionsRepository.findById(USER_A, testCollection.id);
    assert.ok(col);
    assert.equal(col.titleCount, 1, 'titleCount must not decrement when title was not present');
    assert.equal(col.titles.length, 1);
  });

  test('Repeating removal of the previously removed title does not decrement titleCount again', async () => {
    const repeated = await collectionsRepository.removeTitle(USER_A, testCollection.id, titleA1.id);
    assert.equal(repeated, false);

    const col = await collectionsRepository.findById(USER_A, testCollection.id);
    assert.ok(col);
    assert.equal(col.titleCount, 1, 'titleCount must remain 1 on repeated removal');
    assert.equal(col.titles.length, 1);
  });

  test('Tenant Isolation: Cannot add titles owned by another user into collection', async () => {
    await assert.rejects(
      async () => {
        await collectionsRepository.addTitles(USER_A, testCollection.id, [titleB1.id]);
      },
      (err) => err instanceof ForbiddenError
    );
  });

  test('Tenant Isolation: User B cannot add titles to User A collection', async () => {
    await assert.rejects(
      async () => {
        await collectionsRepository.addTitles(USER_B, testCollection.id, [titleB1.id]);
      },
      (err) => err instanceof NotFoundError
    );
  });

  test('Concurrency Safeguard: 10 concurrent requests adding the SAME title do not cause duplicate membership or counter drift', async () => {
    const freshCol = await collectionsRepository.create(USER_A, { name: 'Concurrent Test List' });
    const freshTitle = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Parallel Add Title',
    });

    // Fire 10 parallel add operations for the same title
    await Promise.all(
      Array.from({ length: 10 }).map(() =>
        collectionsRepository.addTitles(USER_A, freshCol.id, [freshTitle.id])
      )
    );

    const col = await collectionsRepository.findById(USER_A, freshCol.id);
    assert.ok(col);
    assert.equal(col.titleCount, 1, 'titleCount must be exactly 1 despite 10 concurrent additions');
    assert.equal(col.titles.length, 1, 'items array must have exactly 1 element');
    assert.equal(col.titles.length, col.titleCount, 'items.length and titleCount must remain consistent');
  });

  test('Concurrency Safeguard: 10 concurrent requests removing the SAME title decrement counter exactly once', async () => {
    const freshCol = await collectionsRepository.create(USER_A, { name: 'Concurrent Remove List' });
    const freshTitle = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Parallel Remove Title',
    });

    await collectionsRepository.addTitles(USER_A, freshCol.id, [freshTitle.id]);
    let col = await collectionsRepository.findById(USER_A, freshCol.id);
    assert.equal(col.titleCount, 1);

    // Fire 10 parallel remove operations
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        collectionsRepository.removeTitle(USER_A, freshCol.id, freshTitle.id)
      )
    );

    const trueCount = results.filter((r) => r === true).length;
    assert.equal(trueCount, 1, 'Exactly one concurrent removal must return true');

    col = await collectionsRepository.findById(USER_A, freshCol.id);
    assert.ok(col);
    assert.equal(col.titleCount, 0, 'titleCount must be 0, never negative');
    assert.equal(col.titles.length, 0);
    assert.equal(col.titles.length, col.titleCount, 'items.length and titleCount must remain consistent');
  });
});

describe('Safeguard: Title Deletion & Referential Consistency', () => {
  test('Deleting a title cascades to its bookmark and removes it from all collections', async () => {
    // 1. Create a title for User A
    const title = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Mob Psycho 100',
    });

    // 2. Create a bookmark for the title
    const bookmark = await bookmarksRepository.create(USER_A, {
      titleId: title.id,
      status: 'consuming',
      progress: 5,
    });
    assert.ok(bookmark.id);

    // 3. Create two collections and add the title to both
    const col1 = await collectionsRepository.create(USER_A, { name: 'Supernatural Series' });
    const col2 = await collectionsRepository.create(USER_A, { name: 'Bones Studio' });

    await collectionsRepository.addTitles(USER_A, col1.id, [title.id]);
    await collectionsRepository.addTitles(USER_A, col2.id, [title.id]);

    let col1AfterAdd = await collectionsRepository.findById(USER_A, col1.id);
    let col2AfterAdd = await collectionsRepository.findById(USER_A, col2.id);
    assert.equal(col1AfterAdd.titleCount, 1);
    assert.equal(col2AfterAdd.titleCount, 1);

    // 4. Delete the title
    const deleted = await titlesRepository.delete(USER_A, title.id);
    assert.equal(deleted, true);

    // 5. Verify title is gone
    const fetchedTitle = await titlesRepository.findById(USER_A, title.id);
    assert.equal(fetchedTitle, null);

    // 6. Verify bookmark is gone
    const fetchedBookmark = await bookmarksRepository.findByTitleId(USER_A, title.id);
    assert.equal(fetchedBookmark, null);

    // 7. Verify title was removed from both collections and titleCount decremented in both
    const col1AfterDel = await collectionsRepository.findById(USER_A, col1.id);
    const col2AfterDel = await collectionsRepository.findById(USER_A, col2.id);
    assert.equal(col1AfterDel.titleCount, 0);
    assert.equal(col1AfterDel.titles.length, 0);
    assert.equal(col2AfterDel.titleCount, 0);
    assert.equal(col2AfterDel.titles.length, 0);

    // 8. Repeated deletion returns false
    const repeatedDelete = await titlesRepository.delete(USER_A, title.id);
    assert.equal(repeatedDelete, false);
  });

  test('Tenant Isolation: User B cannot delete User A title', async () => {
    const title = await titlesRepository.create(USER_A, {
      mediaType: 'manga',
      englishTitle: 'Chainsaw Man',
    });

    const deletedByB = await titlesRepository.delete(USER_B, title.id);
    assert.equal(deletedByB, false, 'User B must not be able to delete User A title');

    // Title still exists for User A
    const fetched = await titlesRepository.findById(USER_A, title.id);
    assert.ok(fetched);
    assert.equal(fetched.englishTitle, 'Chainsaw Man');
  });
});

describe('Safeguard: Bookmarks Operations & Constraints', () => {
  let title;

  before(async () => {
    title = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Neon Genesis Evangelion',
    });
  });

  test('Create bookmark enforces ownership and initial values', async () => {
    const bm = await bookmarksRepository.create(USER_A, {
      titleId: title.id,
      status: 'consuming',
      progress: 12,
      personalRating: 9.5,
    });
    assert.ok(bm.id);
    assert.equal(bm.titleId, title.id);
    assert.equal(bm.personalRating, 9.5);
  });

  test('Enforces uniqueness: cannot create second bookmark for same title and owner', async () => {
    await assert.rejects(
      async () => {
        await bookmarksRepository.create(USER_A, {
          titleId: title.id,
          status: 'completed',
        });
      },
      (err) => err instanceof ConflictError
    );
  });

  test('Upsert bookmark atomically updates existing bookmark', async () => {
    const updated = await bookmarksRepository.upsertByTitleId(USER_A, title.id, {
      status: 'completed',
      progress: 26,
      personalRating: 10,
    });
    assert.equal(updated.status, 'completed');
    assert.equal(updated.progress, 26);
    assert.equal(updated.personalRating, 10);
  });

  test('Tenant Isolation: User B cannot view or update User A bookmark', async () => {
    const bm = await bookmarksRepository.findByTitleId(USER_B, title.id);
    assert.equal(bm, null);

    const listB = await bookmarksRepository.list(USER_B, {
      page: 1,
      pageSize: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    assert.equal(listB.items.length, 0);
  });
});

describe('Safeguard & Features: Titles Query Operations, Filters, Search & Updates', () => {
  let mangaTitle;
  let animeTitle;

  before(async () => {
    animeTitle = await titlesRepository.create(USER_A, {
      mediaType: 'anime',
      englishTitle: 'Jujutsu Kaisen',
      originalTitle: '呪術廻戦',
      releaseYear: 2020,
    });
    mangaTitle = await titlesRepository.create(USER_A, {
      mediaType: 'manga',
      englishTitle: 'Berserk',
      releaseYear: 1989,
    });
  });

  test('Update title properties and nested aliases/tags', async () => {
    const updated = await titlesRepository.update(USER_A, animeTitle.id, {
      synopsis: 'Dark fantasy action series',
      releaseYear: 2020,
      tags: ['Action', 'Supernatural'],
    });
    assert.ok(updated);
    assert.equal(updated.synopsis, 'Dark fantasy action series');
    assert.equal(updated.tags.length, 2);
  });

  test('List titles filters accurately by mediaType', async () => {
    const animeOnly = await titlesRepository.list(USER_A, {
      page: 1,
      pageSize: 10,
      mediaType: 'anime',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    assert.ok(animeOnly.items.length >= 1);
    assert.ok(animeOnly.items.every((i) => i.mediaType === 'anime'));
  });

  test('List titles filters accurately by search query across english and original titles', async () => {
    const searchRes = await titlesRepository.list(USER_A, {
      page: 1,
      pageSize: 10,
      search: 'Jujutsu',
      sortBy: 'title',
      sortOrder: 'asc',
    });
    assert.ok(searchRes.items.length >= 1);
    assert.equal(searchRes.items[0].englishTitle, 'Jujutsu Kaisen');
  });

  test('List titles respects releaseYear sorting with nulls last', async () => {
    const res = await titlesRepository.list(USER_A, {
      page: 1,
      pageSize: 10,
      sortBy: 'releaseYear',
      sortOrder: 'asc',
    });
    assert.ok(res.items.length >= 2);
    const berserkIdx = res.items.findIndex((i) => i.englishTitle === 'Berserk');
    const jjkIdx = res.items.findIndex((i) => i.englishTitle === 'Jujutsu Kaisen');
    assert.ok(berserkIdx !== -1 && jjkIdx !== -1);
    assert.ok(berserkIdx < jjkIdx, 'Berserk (1989) should precede Jujutsu Kaisen (2020)');
  });
});

describe('Safeguard & Features: Bookmarks Query Operations, Pagination & Sorting', () => {
  test('List bookmarks supports pagination and custom sorting', async () => {
    const res = await bookmarksRepository.list(USER_A, {
      page: 1,
      pageSize: 2,
      sortBy: 'personalRating',
      sortOrder: 'desc',
    });
    assert.ok(res.items.length <= 2);
    assert.ok(res.total >= 1);
    assert.equal(res.page, 1);
    assert.equal(res.pageSize, 2);
    assert.ok(res.totalPages >= 1);
  });
});

describe('Safeguard & Deployment: Import Service Atomic Commit & Deployment Transactions', () => {
  test('Import service commit atomically creates Title, initial Bookmark, and Collection link', async () => {
    const importCol = await collectionsRepository.create(USER_A, { name: 'Imported Classics' });
    const importedTitle = await importService.commit(USER_A, {
      draft: {
        externalId: '16498',
        provider: 'myanimelist',
        mediaType: 'anime',
        englishTitle: 'Attack on Titan Season 1',
        originalTitle: '進撃の巨人',
        sourceUrl: 'https://myanimelist.net/anime/16498',
      },
      selectedFields: { englishTitle: true, originalTitle: true },
      initialBookmark: {
        status: 'completed',
        progress: 25,
        personalRating: 9.0,
      },
      collectionIds: [importCol.id],
    });

    assert.ok(importedTitle);
    assert.ok(importedTitle.id);
    assert.equal(importedTitle.englishTitle, 'Attack on Titan Season 1');
    assert.equal(importedTitle.bookmark?.status, 'completed');
    assert.equal(importedTitle.bookmark?.personalRating, 9.0);
    assert.ok(importedTitle.collections.some((c) => c.id === importCol.id));

    // Verify duplicate externalId throws DuplicateImportError
    await assert.rejects(
      async () => {
        await importService.commit(USER_A, {
          draft: {
            externalId: '16498',
            provider: 'myanimelist',
            mediaType: 'anime',
            englishTitle: 'Duplicate Attack on Titan',
          },
          selectedFields: { englishTitle: true },
        });
      },
      (err) => err instanceof DuplicateImportError
    );
  });
});
