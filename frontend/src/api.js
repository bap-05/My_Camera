const API_URL = import.meta.env.VITE_API_URL

export function apiUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function mediaUrl(path) {
    if (typeof path !== 'string' || !path.trim()) return '';
    const value = path.trim();

    try {
        const url = new URL(value, API_URL);
        if (url.pathname.startsWith('/uploads/')) {
            return `${API_URL}${url.pathname}${url.search}`;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        return url.href;
    } catch {
        return '';
    }
}

export function authHeaders(includeJson = false) {
    const headers = {};
    const token = localStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (includeJson) headers['Content-Type'] = 'application/json';
    return headers;
}
