import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { signal } from '@angular/core';
import { authGuard } from './auth.guard';
import { AuthStore } from '../store/auth.store';

/**
 * The client half of the same rule the API now enforces: a route is closed
 * unless someone is signed in. The backend is the thing that actually protects
 * data — this only decides what the browser bothers rendering — but it is the
 * difference between being sent to the login form and watching the list flash
 * up empty before a 401 logs you out again.
 */
describe('authGuard', () => {
  const run = (isAuthenticated: boolean) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: { isAuthenticated: signal(isAuthenticated) },
        },
      ],
    });

    // A CanActivateFn reaches for its dependencies with inject(), so it needs
    // an injection context. Neither argument is read.
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lets a signed-in visitor through', () => {
    // Strictly true, not merely truthy: the redirect below is a UrlTree, and
    // a UrlTree is truthy too.
    expect(run(true)).toBe(true);
  });

  it('sends everyone else to the login form', () => {
    const result = run(false);

    expect(result).toBeInstanceOf(UrlTree);
    // Asserted by the url it serialises to rather than by the shape of the
    // object, so the test says where the visitor lands and not merely that
    // some redirect happened. (It does not pin the leading slash: from the
    // root url, ['/login'] and ['login'] serialise alike.)
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });
});
