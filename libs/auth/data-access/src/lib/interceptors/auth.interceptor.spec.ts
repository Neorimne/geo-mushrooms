import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from '../store/auth.store';
import { ToastStore } from '@geo/shared/util-toast';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authStore: { token: jest.Mock; logout: jest.Mock };
  let toastStore: { showError: jest.Mock };

  beforeEach(() => {
    authStore = {
      token: jest.fn().mockReturnValue('test-token'),
      logout: jest.fn(),
    };
    toastStore = {
      showError: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: authStore },
        { provide: ToastStore, useValue: toastStore },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add Authorization header if token exists', () => {
    httpClient.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('should call authStore.logout on 401 error', () => {
    httpClient.get('/api/test').subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authStore.logout).toHaveBeenCalled();
  });

  it('should call toastStore.showError on generic error', () => {
    httpClient.get('/api/test').subscribe({ error: () => undefined });

    const req = httpMock.expectOne('/api/test');
    req.flush({ message: 'Server Error' }, { status: 500, statusText: 'Internal Server Error' });

    expect(toastStore.showError).toHaveBeenCalledWith('Server Error');
  });
});
