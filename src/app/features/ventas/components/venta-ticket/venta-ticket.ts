import { Component, input } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { Venta } from "../../models/venta.model";
import { MarcaHospedaje } from '../../../../shared/components/marca-hospedaje/marca-hospedaje';
@Component({
  selector: "app-venta-ticket",
  imports: [CurrencyPipe, DatePipe, MarcaHospedaje],
  templateUrl: "./venta-ticket.html",
  styleUrl: "./venta-ticket.css",
})
export class VentaTicket {
  venta = input.required<Venta>();
}
