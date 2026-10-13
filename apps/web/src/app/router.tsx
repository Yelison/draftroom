import type { RouteObject } from 'react-router'
import { HomeRoute } from './HomeRoute.tsx'

/** The route table. The routes of the product replace this one as its screens arrive. */
export const routes: RouteObject[] = [{ path: '/', Component: HomeRoute }]
