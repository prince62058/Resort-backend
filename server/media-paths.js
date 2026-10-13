import path from 'node:path';

const types = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};

export function imageType(filename) {
  return types[path.posix.extname(filename).toLowerCase()];
}

export function validMediaPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
    !/[\\\x00-\x1f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export function mediaUrl(filename) {
  return '/assets/' + filename.split('/').map(encodeURIComponent).join('/');
}
