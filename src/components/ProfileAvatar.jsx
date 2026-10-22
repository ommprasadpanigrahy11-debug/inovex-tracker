import React, { useState } from 'react';

export function getInitials(name = '') {
  if (!name) return 'U';
  // Strip parentheses like "Sarah Vance (CEO / Founder)"
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileAvatar({ user, size = 'md', className = '', style = {} }) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(user?.name);
  const avatarUrl = user?.avatar_url;

  return (
    <div 
      className={`profile-avatar ${size} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {avatarUrl && !imgError ? (
        <img 
          src={avatarUrl} 
          alt={user?.name || 'User avatar'} 
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export default ProfileAvatar;
