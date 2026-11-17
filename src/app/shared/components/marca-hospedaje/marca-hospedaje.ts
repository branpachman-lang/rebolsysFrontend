import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MarcaHospedaje as Datos, MarcaService, rutaLogo } from '../../../core/services/marca-service';

@Component({
  selector: 'app-marca-hospedaje',
  templateUrl: './marca-hospedaje.html',
  styleUrl: './marca-hospedaje.css',
})
export class MarcaHospedaje {
  readonly mostrarSinConfigurar = input(false);
  private readonly datos = signal<Datos | null>(null);
  protected readonly nombre = computed(() => this.datos()?.nombre || (this.mostrarSinConfigurar() ? 'Real Bolognesi' : ''));
  protected readonly ruc = computed(() => this.datos()?.ruc);
  protected readonly direccion = computed(() => this.datos()?.direccion);
  protected readonly logo = computed(() => rutaLogo(this.datos()));

  constructor() {
    inject(MarcaService).consultar().pipe(takeUntilDestroyed()).subscribe({
      next: datos => this.datos.set(datos),
      error: () => {},
    });
  }
}
