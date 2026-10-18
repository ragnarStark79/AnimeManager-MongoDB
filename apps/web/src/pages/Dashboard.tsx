import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Bookmark,
  Library,
  FolderKanban,
  Star,
  ArrowRight,
  Plus,
  Zap,
  Flame,
  Clock,
  Sparkles,
  Clapperboard,
  type LucideIcon,
} from 'lucide-react';
import { PosterCard, Badge, AddTitleModal, FilterChips, LoadingState } from '../components/ui';
import { api, type TitleSummary } from '../lib/api-client';
import { DEMO_TITLES } from '../data/demo';
import type { MediaType } from '@animemanager/shared';
import './Dashboard.css';

/* ── Category filter options (matching reference image aesthetic) ── */
type DashboardFilter = 'all' | MediaType | 'trending' | 'planning';

const FILTER_OPTIONS: { value: DashboardFilter; label: string; icon: LucideIcon }[] = [
  { value: 'all',      label: 'All Titles',    icon: Sparkles },
  { value: 'anime',    label: 'Anime',         icon: Clapperboard },
  { value: 'manga',    label: 'Manga',         icon: BookOpen },
  { value: 'manhwa',   label: 'Manhwa',        icon: Zap },
  { value: 'trending', label: 'Top Rated',     icon: Flame },
  { value: 'planning', label: 'Plan to Watch', icon: Clock },
];

export function Dashboard() {
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>('all');
  const [addOpen, setAddOpen] = useState(false);

  // Live library titles
  const { data: titlesData, isLoading } = useQuery({
    queryKey: ['titles'],
    queryFn: () => api.titles.list({ pageSize: 50 }),
  });

  const liveTitles: TitleSummary[] = titlesData?.data || [];
  const hasLiveTitles = liveTitles.length > 0;

  const filterOptions = FILTER_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
    icon: <opt.icon size={14} />,
  }));

  const filteredPosters = useMemo(() => {
    if (hasLiveTitles) {
      let filtered = [...liveTitles];
      if (activeFilter === 'anime' || activeFilter === 'manga' || activeFilter === 'manhwa') {
        filtered = filtered.filter((t) => t.mediaType === activeFilter);
      } else if (activeFilter === 'trending') {
        filtered = filtered.sort(
          (a, b) => (b.bookmark?.personalRating ?? b.sourceScore ?? 0) - (a.bookmark?.personalRating ?? a.sourceScore ?? 0)
        );
      } else if (activeFilter === 'planning') {
        filtered = filtered.filter((t) => t.bookmark?.status === 'plan_to_consume');
      }
      return filtered.slice(0, 6);
    }

    // Fallback showcase when library is new
    switch (activeFilter) {
      case 'all':
        return DEMO_TITLES.slice(0, 6).map((d) => ({
          id: d.titleId,
          englishTitle: d.title,
          mediaType: d.mediaType,
          coverUrl: d.coverUrl,
          releaseYear: d.year,
          sourceScore: d.rating,
          publicationStatus: d.bookmarkStatus,
          bookmark: d.rating ? { personalRating: d.rating, status: d.bookmarkStatus as any } : null,
        }));
      case 'trending':
        return [...DEMO_TITLES]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, 6)
          .map((d) => ({
            id: d.titleId,
            englishTitle: d.title,
            mediaType: d.mediaType,
            coverUrl: d.coverUrl,
            releaseYear: d.year,
            sourceScore: d.rating,
            publicationStatus: d.bookmarkStatus,
            bookmark: d.rating ? { personalRating: d.rating, status: d.bookmarkStatus as any } : null,
          }));
      case 'planning':
        return DEMO_TITLES.filter((t) => t.bookmarkStatus === 'plan_to_consume')
          .slice(0, 6)
          .map((d) => ({
            id: d.titleId,
            englishTitle: d.title,
            mediaType: d.mediaType,
            coverUrl: d.coverUrl,
            releaseYear: d.year,
            sourceScore: d.rating,
            publicationStatus: d.bookmarkStatus,
            bookmark: d.rating ? { personalRating: d.rating, status: d.bookmarkStatus as any } : null,
          }));
      default:
        return DEMO_TITLES.filter((t) => t.mediaType === activeFilter)
          .slice(0, 6)
          .map((d) => ({
            id: d.titleId,
            englishTitle: d.title,
            mediaType: d.mediaType,
            coverUrl: d.coverUrl,
            releaseYear: d.year,
            sourceScore: d.rating,
            publicationStatus: d.bookmarkStatus,
            bookmark: d.rating ? { personalRating: d.rating, status: d.bookmarkStatus as any } : null,
          }));
    }
  }, [activeFilter, liveTitles, hasLiveTitles]);

  const spotlightAnime = hasLiveTitles
    ? liveTitles.find((t) => t.mediaType === 'anime') || liveTitles[0]
    : null;

  const spotlightManhwa = hasLiveTitles
    ? liveTitles.find((t) => t.mediaType === 'manhwa' || t.mediaType === 'manga') || liveTitles[1]
    : null;

  const sectionTitle =
    activeFilter === 'anime'    ? 'Anime Collection' :
    activeFilter === 'manga'    ? 'Manga Collection' :
    activeFilter === 'manhwa'   ? 'Manhwa Collection' :
    activeFilter === 'trending' ? 'Top Rated' :
    activeFilter === 'planning' ? 'Plan to Watch' :
    'Recent Library Showcase';

  return (
    <div className="dashboard">
      {/* ── Page Header / Welcome ── */}
      <div className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Personal Media Library</p>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-sub">
            Your private sanctuary for tracking and discovering anime, manga, and manhwa.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn--primary btn--md"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={15} aria-hidden="true" />
            <span>Add Title</span>
          </button>
          <Link to="/import" className="btn btn--secondary btn--md">
            <Zap size={15} aria-hidden="true" />
            <span>Import from MAL</span>
          </Link>
        </div>
      </div>

      {/* ── Featured Hero Spotlight ── */}
      <section className="dashboard-spotlight-grid" aria-label="Featured spotlights">
        {/* Spotlight Card 1 */}
        <div className="spotlight-card spotlight-card--anime">
          <div className="spotlight-card-content">
            <div className="spotlight-badge-row">
              <Badge variant="anime" size="sm">
                {spotlightAnime ? spotlightAnime.mediaType.toUpperCase() : 'ANIME SPOTLIGHT'}
              </Badge>
              {(spotlightAnime?.bookmark?.personalRating || spotlightAnime?.sourceScore) && (
                <span className="spotlight-rating">
                  <Star size={12} fill="currentColor" aria-hidden="true" />
                  {(spotlightAnime.bookmark?.personalRating ?? spotlightAnime.sourceScore)?.toFixed(1)}
                </span>
              )}
            </div>
            <h2 className="spotlight-title">
              {spotlightAnime ? spotlightAnime.englishTitle : 'Frieren: Beyond Journey\'s End'}
            </h2>
            <p className="spotlight-desc">
              {spotlightAnime?.synopsis
                ? spotlightAnime.synopsis.slice(0, 150) + '...'
                : 'An elf mage and her companions reflect on life, mortality, and journeys taken long ago.'}
            </p>
            <div className="spotlight-actions">
              <Link
                to={spotlightAnime ? `/titles/${spotlightAnime.id}` : '/titles'}
                className="spotlight-btn spotlight-btn--play"
              >
                <BookOpen size={14} aria-hidden="true" />
                <span>View Title</span>
              </Link>
              <Link to="/bookmarks" className="spotlight-btn spotlight-btn--glass">
                <Bookmark size={14} aria-hidden="true" />
                <span>Bookmarks</span>
              </Link>
            </div>
          </div>
          <div className="spotlight-card-art spotlight-card-art--blue" aria-hidden="true">
            <div className="spotlight-orb spotlight-orb--blue" />
            <div className="spotlight-art-silhouette">ANIME</div>
          </div>
        </div>

        {/* Spotlight Card 2 */}
        <div className="spotlight-card spotlight-card--manhwa">
          <div className="spotlight-card-content">
            <div className="spotlight-badge-row">
              <Badge variant="manhwa" size="sm">
                {spotlightManhwa ? spotlightManhwa.mediaType.toUpperCase() : 'MANHWA SPOTLIGHT'}
              </Badge>
              {(spotlightManhwa?.bookmark?.personalRating || spotlightManhwa?.sourceScore) && (
                <span className="spotlight-rating">
                  <Star size={12} fill="currentColor" aria-hidden="true" />
                  {(spotlightManhwa.bookmark?.personalRating ?? spotlightManhwa.sourceScore)?.toFixed(1)}
                </span>
              )}
            </div>
            <h2 className="spotlight-title">
              {spotlightManhwa ? spotlightManhwa.englishTitle : 'Solo Leveling'}
            </h2>
            <p className="spotlight-desc">
              {spotlightManhwa?.synopsis
                ? spotlightManhwa.synopsis.slice(0, 150) + '...'
                : 'Sung Jin-woo rises from the weakest E-rank hunter to humanity\'s greatest hope after discovering a hidden quest.'}
            </p>
            <div className="spotlight-actions">
              <Link
                to={spotlightManhwa ? `/titles/${spotlightManhwa.id}` : '/collections'}
                className="spotlight-btn spotlight-btn--play"
              >
                <BookOpen size={14} aria-hidden="true" />
                <span>View Title</span>
              </Link>
              <Link to="/collections" className="spotlight-btn spotlight-btn--glass">
                <FolderKanban size={14} aria-hidden="true" />
                <span>Collections</span>
              </Link>
            </div>
          </div>
          <div className="spotlight-card-art spotlight-card-art--lavender" aria-hidden="true">
            <div className="spotlight-orb spotlight-orb--purple" />
            <div className="spotlight-art-silhouette">MANHWA</div>
          </div>
        </div>
      </section>

      {/* ── Category Filter Pills Row ── */}
      <section className="dashboard-filter-section" aria-label="Media category filters">
        <FilterChips
          options={filterOptions}
          value={activeFilter}
          onChange={setActiveFilter}
          label="Filter catalog by category"
          className="filter-chips--scroll"
        />
      </section>

      {/* ── Catalog Poster Grid ── */}
      <section className="dashboard-section" aria-labelledby="trending-heading">
        <div className="dashboard-section-header">
          <div>
            <div className="dashboard-section-eyebrow">
              <Flame size={14} aria-hidden="true" />
              <span>Catalog Showcase</span>
            </div>
            <h2 id="trending-heading" className="dashboard-section-title">
              {sectionTitle}
            </h2>
          </div>
          <div className="dashboard-section-actions">
            <Link to="/titles" className="dashboard-see-all">
              <span>View all catalog</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Loading catalog showcase..." />
        ) : filteredPosters.length > 0 ? (
          <div className="dashboard-poster-grid">
            {filteredPosters.map((item) => (
              <PosterCard
                key={item.id}
                titleId={item.id}
                title={item.englishTitle}
                mediaType={item.mediaType as any}
                coverUrl={item.coverUrl || undefined}
                year={item.releaseYear || undefined}
                rating={item.bookmark?.personalRating ?? (item.sourceScore ?? undefined)}
              />
            ))}
          </div>
        ) : (
          <div className="dashboard-empty-filter">
            <p className="dashboard-empty-filter-msg">
              No titles currently match this category in your library.
            </p>
            <button
              type="button"
              className="btn btn--secondary btn--md"
              onClick={() => setActiveFilter('all')}
            >
              Show All
            </button>
          </div>
        )}
      </section>

      {/* ── Overview & Navigation Cards ── */}
      <section className="dashboard-section" aria-label="Library navigation">
        <div className="dashboard-nav-grid">
          <Link to="/bookmarks" className="dashboard-nav-card glass-interactive">
            <div className="dashboard-nav-card-icon dashboard-nav-card-icon--blue">
              <Bookmark size={22} aria-hidden="true" />
            </div>
            <div className="dashboard-nav-card-content">
              <h3 className="dashboard-nav-card-title">Bookmarks & Progress</h3>
              <p className="dashboard-nav-card-sub">
                Track status across In Progress, Plan to Watch, Completed, and On Hold.
              </p>
            </div>
            <ArrowRight size={16} className="dashboard-nav-card-arrow" aria-hidden="true" />
          </Link>

          <Link to="/my-list" className="dashboard-nav-card glass-interactive">
            <div className="dashboard-nav-card-icon dashboard-nav-card-icon--purple">
              <Library size={22} aria-hidden="true" />
            </div>
            <div className="dashboard-nav-card-content">
              <h3 className="dashboard-nav-card-title">My List</h3>
              <p className="dashboard-nav-card-sub">
                User-created lists and custom folders. Series can belong to multiple groups.
              </p>
            </div>
            <ArrowRight size={16} className="dashboard-nav-card-arrow" aria-hidden="true" />
          </Link>

          <Link to="/collections" className="dashboard-nav-card glass-interactive">
            <div className="dashboard-nav-card-icon dashboard-nav-card-icon--teal">
              <FolderKanban size={22} aria-hidden="true" />
            </div>
            <div className="dashboard-nav-card-content">
              <h3 className="dashboard-nav-card-title">Collections</h3>
              <p className="dashboard-nav-card-sub">
                Themed collections, shared franchises, and multi-series curations.
              </p>
            </div>
            <ArrowRight size={16} className="dashboard-nav-card-arrow" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── Add Title Modal ── */}
      <AddTitleModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
