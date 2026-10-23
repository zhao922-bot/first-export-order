import { notImplemented } from '../app/notImplemented';
/** 仅预留剧情路由守卫。 */
export function canVisitStoryRoute(_path: string): boolean {
  return notImplemented('storyRouteGuard');
}
