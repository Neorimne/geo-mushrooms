import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth.store';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { API_URL } from '@geo/shared/util-config';

describe('AuthStore', () => {
  let store: InstanceType<typeof AuthStore>;

  beforeEach(() => {
    // Mock localStorage
    const storeMap: Record<string, string> = {};
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => storeMap[key] || null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { storeMap[key] = value; });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => { delete storeMap[key]; });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        AuthStore,
        { provide: API_URL, useValue: 'http://api' }
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be created with initial state', () => {
    expect(store.token()).toBeNull();
    expect(store.isLoading()).toBe(false);
  });

  it('should clear expired token on init', () => {
    // Create an expired token (payload with exp in the past)
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ exp: now - 3600 });
    const token = `header.${btoa(payload)}.signature`;
    
    localStorage.setItem('auth_token', token);
    
    // Re-initialize store to trigger onInit
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [AuthStore, { provide: API_URL, useValue: 'http://api' }],
    });
    const newStore = TestBed.inject(AuthStore);
    
    expect(newStore.token()).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('should keep valid token on init', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ exp: now + 3600 });
    const token = `header.${btoa(payload)}.signature`;
    
    localStorage.setItem('auth_token', token);
    
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [AuthStore, { provide: API_URL, useValue: 'http://api' }],
    });
    const newStore = TestBed.inject(AuthStore);
    
    expect(newStore.token()).toBe(token);
  });
});
