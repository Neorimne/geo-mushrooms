import { Type } from '@nestjs/common';
import { AppModule } from '../app.module';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * An inventory, not a wiring check: which routes in the whole application are
 * reachable without a token?
 *
 * `app.module.spec.ts` proves that closed routes are closed. What it cannot
 * prove is that nobody has quietly opened a new one — a third `@Public()` is
 * invisible in a diff unless you already know to look for it, and it is the
 * single change here that would hand out data. So the controllers are walked
 * from `AppModule`'s own metadata and the answer is compared against the list.
 *
 * Walking the module graph rather than importing a hand-written list of
 * controllers is the point: a controller has to be reachable from `AppModule`
 * to be routed at all, so anything the application serves is something this
 * test sees.
 */
describe('the routes that need no token', () => {
  /** Every controller reachable from AppModule, including through its imports. */
  const collectControllers = (root: Type): Type[] => {
    const seen = new Set<Type>();
    const controllers: Type[] = [];

    const walk = (module: Type) => {
      if (seen.has(module)) return;
      seen.add(module);

      for (const controller of Reflect.getMetadata('controllers', module) ?? []) {
        controllers.push(controller);
      }

      for (const imported of Reflect.getMetadata('imports', module) ?? []) {
        // A dynamic module (ConfigModule.forRoot(), JwtModule.registerAsync())
        // arrives as { module, ... } rather than as the class itself.
        const target = imported?.module ?? imported;
        if (typeof target === 'function') walk(target);
      }
    };

    walk(root);
    return controllers;
  };

  /** `Controller.method` for every handler carrying the marker. */
  const collectPublicRoutes = (controllers: Type[]): string[] => {
    const routes: string[] = [];

    for (const controller of controllers) {
      const openWholeController = Reflect.getMetadata(IS_PUBLIC_KEY, controller);

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        if (name === 'constructor') continue;

        const handler = controller.prototype[name];
        // Nest stamps a path onto anything it routes; everything else on the
        // prototype is a helper and cannot be reached over HTTP.
        const isRoute = Reflect.getMetadata('path', handler) !== undefined;
        if (!isRoute) continue;

        if (openWholeController || Reflect.getMetadata(IS_PUBLIC_KEY, handler)) {
          routes.push(`${controller.name}.${name}`);
        }
      }
    }

    return routes.sort();
  };

  it('are exactly these two, and adding a third is a deliberate act', () => {
    const controllers = collectControllers(AppModule);

    // A sanity check on the walk itself: if this ever collapses to nothing,
    // the assertion below would pass by finding no routes at all.
    expect(controllers.length).toBeGreaterThanOrEqual(6);

    expect(collectPublicRoutes(controllers)).toEqual([
      // The capability flag that tells the client whether to show dev tools.
      'AppController.getConfig',
      // Where tokens come from. Not optional: guarding it would leave no way
      // of ever obtaining the token it would then demand.
      'AuthController.login',
    ]);
  });
});
