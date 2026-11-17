import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface MarcaHospedaje {
  nombre: string | null;
  ruc: string | null;
  direccion: string | null;
  logoRuta: string | null;
}

export function rutaLogo(marca: MarcaHospedaje | null): string | null {
  const ruta = marca?.logoRuta;
  return ruta && /^\/api\/v1\/configuraciones\/marca\/logo\/[a-f0-9]{64}\.(jpg|png)$/.test(ruta) ? ruta : null;
}

@Injectable({ providedIn: 'root' })
export class MarcaService {
  private readonly http = inject(HttpClient);

  consultar() {
    return this.http.get<MarcaHospedaje>(environment.apiUrl + '/configuraciones/marca');
  }
}
