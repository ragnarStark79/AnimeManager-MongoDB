import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Badge } from './Badge';
import './PosterCard.css';

type MediaType = 'anime' | 'manga' | 'manhwa';

interface PosterCardProps {
  titleId: string;
  title: string;
  mediaType: MediaType;
  coverUrl?: string;
  year?: number;
  rating?: number;
  status?: string;
  className?: string;
}

const PLACEHOLDER_COLORS: Record<MediaType, [string, string]> = {
  anime:  ['hsl(215,80%,35%)', 'hsl(240,70%,28%)'],
  manga:  ['hsl(35,80%,35%)',  'hsl(20,75%,28%)'],
  manhwa: ['hsl(155,65%,28%)', 'hsl(180,60%,22%)'],
};

const MEDIA_INITIALS: Record<MediaType, string> = {
  anime:  'AN',
  manga:  'MG',
  manhwa: 'MH',
};

export function PosterCard({
  titleId,
  title,
  mediaType,
  coverUrl,
  year,
  rating,
  status,
  className = '',
}: PosterCardProps) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const [from, to] = PLACEHOLDER_COLORS[mediaType];
  const initials = title.slice(0, 2).toUpperCase();

  return (
    <Link
      to={`/titles/${titleId}`}
      className={['poster-card', className].filter(Boolean).join(' ')}
      aria-label={`${title} — ${mediaType}`}
    >
      {/* Cover image / placeholder */}
      <div className="poster-card-image-wrap">
        {coverUrl && !imgFailed ? (
          <img
            src={coverUrl}
            alt=""
            className="poster-card-image"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="poster-card-placeholder"
            style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
            aria-hidden="true"
          >
            <span className="poster-card-placeholder-initial">{initials}</span>
            <span className="poster-card-placeholder-type">{MEDIA_INITIALS[mediaType]}</span>
          </div>
        )}

        {/* Overlay */}
        <div className="poster-card-overlay" aria-hidden="true">
          <div className="poster-card-overlay-content">
            <Badge variant={mediaType} size="sm">{mediaType}</Badge>
            {rating != null && (
              <span className="poster-card-rating">
                <Star size={10} fill="currentColor" aria-hidden="true" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="poster-card-meta">
        <p className="poster-card-title truncate" title={title}>{title}</p>
        <div className="poster-card-sub">
          {rating != null && (
            <span className="poster-card-sub-rating">
              <Star size={11} fill="currentColor" aria-hidden="true" />
              <span>{rating.toFixed(1)}</span>
            </span>
          )}
          {year && <span className="poster-card-year">{year}</span>}
          {status && <span className="poster-card-status">{status}</span>}
        </div>
      </div>
    </Link>
  );
}
