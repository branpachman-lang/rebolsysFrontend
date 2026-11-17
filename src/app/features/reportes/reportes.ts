import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subscription, finalize, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { mensajeError } from '../../core/utils/http-error';
import { MarcaHospedaje } from '../../shared/components/marca-hospedaje/marca-hospedaje';
import { DialogFocus } from '../../shared/directives/dialog-focus';
import { InformeDetalle } from '../limpieza/limpieza-api';

interface Pagina<T> { filas: T[]; pagina: number; haySiguiente: boolean; }
interface Incidencia {
  idInforme: number; habitacion: string; fecha: string; estadoInforme: string;
  mueble: string; condicion: string; observacion: string | null; idTicket: number | null; estadoTicket: string | null;
}
interface Financiero {
  filas: { concepto: string; medioPago: string; monto: number }[];
  cobrosReservas: number; cobrosVentas: number; ingresosManuales: number; egresos: number; neto: number;
}
interface Cierre {
  idTurno: number; usuario: string; apertura: string; cierre: string; medioPago: string | null;
  esperado: number | null; declarado: number | null; diferencia: number | null;
}
interface Existencia { id: number; producto: string; categoria: string; estado: string; stock: number; minimo: number; }
interface Mueble { id: number; mueble: string; tipo: string; habitacion: string | null; estado: string; condicion: string; }

const REPORTES = [
  { id: 'incidencias', titulo: 'Incidencias' },
  { id: 'financiero', titulo: 'Financiero' },
  { id: 'cierres-caja', titulo: 'Cierre de caja' },
  { id: 'inventario/productos', titulo: 'Inventario de productos' },
  { id: 'inventario/mobiliario', titulo: 'Inventario de mobiliario' },
] as const;
type Vista = typeof REPORTES[number]['id'];
type Resultado =
  | { vista: 'incidencias'; datos: Pagina<Incidencia> }
  | { vista: 'financiero'; datos: Financiero }
  | { vista: 'cierres-caja'; datos: Pagina<Cierre> }
  | { vista: 'inventario/productos'; datos: Pagina<Existencia> }
  | { vista: 'inventario/mobiliario'; datos: Pagina<Mueble> };

const FILTROS = { desde: '', hasta: '', habitacion: '', estado: '', usuario: '', buscar: '', stockBajo: false };
const ETIQUETAS: Record<string, string> = {
  POR_APROBAR: 'Por aprobar', APROBADO: 'Aprobado', INVALIDADO: 'Invalidado',
  EMITIDO: 'Resuelto', RESUELTO: 'Resuelto', OPTIMO: 'Óptimo', BUENO: 'Óptimo', DANADO: 'Dañado',
  FALTANTE: 'Faltante', EN_REPARACION: 'En reparación', EN_HABITACION: 'Asignado',
  ACTIVO: 'Activo', INACTIVO: 'Inactivo', RESERVAS: 'Cobros de reservas', VENTAS: 'Cobros de ventas',
  INGRESOS_MANUALES: 'Ingresos manuales', EGRESOS: 'Egresos',
};

@Component({
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, MarcaHospedaje, DialogFocus],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly base = environment.apiUrl + '/reportes/';
  private solicitud?: Subscription;
  private solicitudInforme?: Subscription;
  protected readonly reportes = REPORTES;
  protected readonly vista = signal<Vista>('incidencias');
  protected readonly resultado = signal<Resultado | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly errorRango = signal('');
  protected readonly informeAbierto = signal<number | null>(null);
  protected readonly detalle = signal<InformeDetalle | null>(null);
  protected readonly errorInforme = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group(FILTROS);
  protected readonly aplicados = signal(FILTROS);

  constructor() {
    this.consultar(0);
  }

  protected seleccionar(vista: Vista) {
    if (vista === this.vista()) return;
    this.vista.set(vista);
    this.form.reset(FILTROS);
    this.aplicar();
  }

  protected aplicar() {
    const filtros = this.form.getRawValue();
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      this.errorRango.set('La fecha inicial debe ser anterior o igual a la final.');
      return;
    }
    this.errorRango.set('');
    this.aplicados.set(filtros);
    this.consultar(0);
  }

  protected limpiar() {
    this.form.reset(FILTROS);
    this.aplicar();
  }

  protected etiqueta(codigo: string | null) {
    return codigo ? (ETIQUETAS[codigo] ?? codigo) : '—';
  }

  protected imprimir() {
    window.print();
  }

  protected verInforme(id: number) {
    this.solicitudInforme?.unsubscribe();
    this.informeAbierto.set(id);
    this.detalle.set(null);
    this.errorInforme.set('');
    this.solicitudInforme = this.http.get<InformeDetalle>(this.base + 'incidencias/' + id)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: datos => this.detalle.set(datos),
        error: error => this.errorInforme.set(mensajeError(error)),
      });
  }

  protected cerrarInforme() {
    this.solicitudInforme?.unsubscribe();
    this.informeAbierto.set(null);
  }

  protected consultar(pagina: number) {
    this.solicitud?.unsubscribe();
    this.cargando.set(true);
    this.resultado.set(null);
    this.error.set('');
    const vista = this.vista();
    const filtros = this.aplicados();
    let params = new HttpParams();
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.habitacion.trim()) params = params.set('habitacion', filtros.habitacion.trim());
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.usuario.trim()) params = params.set('usuario', filtros.usuario.trim());
    if (filtros.buscar.trim()) params = params.set('buscar', filtros.buscar.trim());
    if (filtros.stockBajo) params = params.set('stockBajo', true);
    if (vista !== 'financiero') params = params.set('pagina', pagina);
    this.solicitud = this.obtener(vista, params)
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.cargando.set(false))).subscribe({
        next: resultado => this.resultado.set(resultado),
        error: error => this.error.set(mensajeError(error)),
      });
  }

  private obtener(vista: Vista, params: HttpParams): Observable<Resultado> {
    const url = this.base + vista;
    switch (vista) {
      case 'incidencias':
        return this.http.get<Pagina<Incidencia>>(url, { params }).pipe(map(datos => ({ vista, datos })));
      case 'financiero':
        return this.http.get<Financiero>(url, { params }).pipe(map(datos => ({ vista, datos })));
      case 'cierres-caja':
        return this.http.get<Pagina<Cierre>>(url, { params }).pipe(map(datos => ({ vista, datos })));
      case 'inventario/productos':
        return this.http.get<Pagina<Existencia>>(url, { params }).pipe(map(datos => ({ vista, datos })));
      case 'inventario/mobiliario':
        return this.http.get<Pagina<Mueble>>(url, { params }).pipe(map(datos => ({ vista, datos })));
    }
  }
}
