import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { ReactiveFormsModule } from '@angular/forms';
import { AuthStore } from '@geo/auth/data-access';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authStore: Partial<InstanceType<typeof AuthStore>>;

  beforeEach(async () => {
    authStore = {
      login: jest.fn(),
      isLoading: signal(false),
      error: signal<string | null>(null),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        { provide: AuthStore, useValue: authStore },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have invalid form when empty', () => {
    expect(component['form'].invalid).toBe(true);
  });

  it('should call login on submit when form is valid', () => {
    const form = component['form'];
    form.patchValue({
      email: 'test@test.com',
      password: 'password123',
    });

    component['onSubmit']();
    expect(authStore.login).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: 'password123',
    });
  });

  it('should mark all as touched if form is invalid on submit', () => {
    const form = component['form'];
    const markAllAsTouchedSpy = jest.spyOn(form, 'markAllAsTouched');
    
    component['onSubmit']();
    
    expect(markAllAsTouchedSpy).toHaveBeenCalled();
    expect(authStore.login).not.toHaveBeenCalled();
  });
});
