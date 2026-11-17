import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { Observable, finalize, forkJoin } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MarcaHospedaje, rutaLogo } from '../../../core/services/marca-service';
import { mensajeError } from '../../../core/utils/http-error';

type Politica = { minutosInactividad: number; intentosFallidos: number };
type Tipo = { idTipoHabitacion: number; nombreTipo: string; capacidadMax: number; precioBase: number };
type Seccion = 'hospedaje' | 'seguridad' | 'comerciales';

@Component({
  imports: [ReactiveFormsModule, CurrencyPipe],
  templateUrl: './sistema.html',
  styleUrl: './sistema.css',
})
export class Sistema {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly base = environment.apiUrl + '/configuraciones/sistema';

  protected readonly seccion = signal<Seccion>('hospedaje');
  protected readonly cargando = signal(true);
  protected readonly listo = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly marca = signal<MarcaHospedaje | null>(null);
  protected readonly tipos = signal<Tipo[]>([]);
  protected readonly seleccionado = signal<Tipo | null>(null);
  protected readonly elegido = signal<File | null>(null);
  protected readonly vistaLogo = signal<string | null>(null);
  protected readonly rutaLogo = rutaLogo;
  protected readonly hospedaje = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
    ruc: ['', [Validators.required, Validators.pattern(/^[0-9]{11}$/)]],
    direccion: ['', Validators.maxLength(200)],
  });
  protected readonly politica = this.fb.group({
    minutosInactividad: [30, [Validators.required, Validators.min(1), Validators.max(1440), Validators.pattern(/^\d+$/)]],
    intentosFallidos: [5, [Validators.required, Validators.min(1), Validators.max(5), Validators.pattern(/^\d+$/)]],
  });
  protected readonly comercial = this.fb.group({
    capacidadMax: [1, [Validators.required, Validators.min(1), Validators.max(99), Validators.pattern(/^\d+$/)]],
    precioBase: [0, [Validators.required, Validators.min(0), Validators.max(99999999.99), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
  });

  constructor() {
    this.destroy.onDestroy(() => this.limpiarLogo());
    this.cargar();
  }

  protected cargar() {
    this.cargando.set(true);
    this.error.set('');
    forkJoin({
      marca: this.http.get<MarcaHospedaje>(this.base + '/hospedaje'),
      politica: this.http.get<Politica>(this.base + '/seguridad'),
      tipos: this.http.get<Tipo[]>(this.base + '/comerciales'),
    }).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.cargando.set(false))).subscribe({
      next: ({ marca, politica, tipos }) => {
        this.cargarMarca(marca);
        this.politica.reset(politica);
        this.tipos.set(tipos);
        this.listo.set(true);
      },
      error: error => this.error.set(mensajeError(error)),
    });
  }

  protected mostrar(seccion: Seccion) {
    if (seccion === this.seccion()) return;
    this.seccion.set(seccion);
    this.limpiarLogo();
    this.error.set('');
    this.aviso.set('');
  }

  protected guardarHospedaje() {
    const datos = this.hospedaje.getRawValue();
    if (this.hospedaje.invalid || !datos.nombre.trim() || this.guardando()) return;
    this.guardar(this.http.put<MarcaHospedaje>(this.base + '/hospedaje', datos),
      marca => this.cargarMarca(marca), 'Datos del hospedaje guardados.');
  }

  protected seleccionarLogo(entrada: HTMLInputElement) {
    const archivo = entrada.files?.item(0) ?? null;
    this.error.set('');
    this.aviso.set('');
    this.limpiarLogo();
    if (archivo && (archivo.size === 0 || archivo.size > 5 * 1024 * 1024
      || !['image/jpeg', 'image/png'].includes(archivo.type))) {
      this.error.set('Selecciona una imagen JPEG o PNG de hasta 5 MB.');
      entrada.value = '';
      return;
    }
    this.elegido.set(archivo);
    if (archivo) this.vistaLogo.set(URL.createObjectURL(archivo));
  }

  protected guardarLogo(entrada: HTMLInputElement) {
    const archivo = this.elegido();
    if (!archivo || this.guardando()) return;
    const datos = new FormData();
    datos.set('archivo', archivo);
    this.guardar(this.http.put<MarcaHospedaje>(this.base + '/hospedaje/logo', datos), marca => {
      this.marca.set(marca);
      this.limpiarLogo();
      entrada.value = '';
    }, 'Logo actualizado.');
  }

  protected guardarPolitica() {
    if (this.politica.invalid || this.guardando()) return;
    this.guardar(this.http.put<Politica>(this.base + '/seguridad', this.politica.getRawValue()),
      politica => this.politica.reset(politica), 'Política de seguridad guardada.');
  }

  protected editar(tipo: Tipo) {
    this.seleccionado.set(tipo);
    this.comercial.reset({ capacidadMax: tipo.capacidadMax, precioBase: tipo.precioBase });
  }

  protected guardarComercial() {
    const tipo = this.seleccionado();
    if (!tipo || this.comercial.invalid || this.guardando()) return;
    const datos = this.comercial.getRawValue();
    this.guardar(this.http.put<Tipo>(this.base + '/comerciales/' + tipo.idTipoHabitacion, datos),
      actualizado => {
        this.tipos.update(tipos => tipos.map(fila => fila.idTipoHabitacion === actualizado.idTipoHabitacion ? actualizado : fila));
        this.seleccionado.set(null);
      }, 'Parámetros comerciales guardados.');
  }

  private cargarMarca(marca: MarcaHospedaje) {
    this.marca.set(marca);
    this.hospedaje.reset({ nombre: marca.nombre ?? '', ruc: marca.ruc ?? '', direccion: marca.direccion ?? '' });
  }

  private limpiarLogo() {
    const ruta = this.vistaLogo();
    if (ruta) URL.revokeObjectURL(ruta);
    this.vistaLogo.set(null);
    this.elegido.set(null);
  }

  private guardar<T>(peticion: Observable<T>, completar: (datos: T) => void, texto: string) {
    this.guardando.set(true);
    this.error.set('');
    this.aviso.set('');
    peticion.pipe(takeUntilDestroyed(this.destroy), finalize(() => this.guardando.set(false))).subscribe({
      next: datos => { completar(datos); this.aviso.set(texto); },
      error: error => this.error.set(mensajeError(error)),
    });
  }
}
