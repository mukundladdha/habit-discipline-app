export function getOrCreateUserId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem('userId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('userId', id);
  }
  return id;
}
