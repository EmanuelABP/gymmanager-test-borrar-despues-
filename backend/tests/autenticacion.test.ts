import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { hash } from 'bcryptjs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crearIniciadorSesion } from '../src/controladores/login.ts';
import { crearRegistrador } from '../src/controladores/register.ts';
import { crearGestorClientes } from '../src/controladores/clientes.ts';
import { memoria } from './memoria.ts';
import { semilla, usuarioSesion, id } from './fixtures.ts';

type Gestor = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
async function pedir(gestor: Gestor, datos: unknown, tipo = 'application/json') {
    const cuerpo = typeof datos === 'string' ? datos : JSON.stringify(datos);
    const req = Readable.from([cuerpo]) as unknown as IncomingMessage;
    req.method = 'POST'; req.url = '/api/clientes'; req.headers = { 'content-type': tipo };
    let estado = 0, contenido = ''; const cabeceras = new Map<string, string>();
    const res = {
        writeHead: (codigo: number) => { estado = codigo; },
        setHeader: (clave: string, valor: string) => { cabeceras.set(clave, valor); },
        end: (valor: string) => { contenido = valor; },
    } as unknown as ServerResponse;
    await gestor(req, res);
    return { estado, datos: JSON.parse(contenido), cookie: cabeceras.get('Set-Cookie') };
}

test('login usa la sesión compartida de ocho horas y no expone su token en JSON', async () => {
    const almacen = memoria(semilla());
    await almacen.db.collection('usuarios').updateOne({ _id: id(3) }, { $set: { passwordHash: await hash('Prueba1234', 12) } });
    const login = crearIniciadorSesion({ conectar: async () => almacen.db });
    const respuesta = await pedir(login, { email: ' CLIENTE@example.test ', contrasena: 'Prueba1234' });
    assert.equal(respuesta.estado, 200);
    assert.match(respuesta.cookie!, /HttpOnly; SameSite=Lax; Path=\/; Max-Age=28800/);
    const token = /gymmanager_sesion=([a-f0-9]{64})/.exec(respuesta.cookie!)![1]!;
    const sesion = almacen.documentos('sesiones')[0]!;
    assert.equal(sesion.tokenHash, createHash('sha256').update(token).digest('hex'));
    assert.ok(Math.abs(sesion.fechaVencimiento.getTime() - sesion.fechaCreacion.getTime() - 8 * 3600000) < 100);
    assert.equal(JSON.stringify(respuesta.datos).includes(token), false);
    assert.equal(respuesta.datos.passwordHash, undefined);
});

test('login conserva el mismo rechazo para contraseña incorrecta, cuenta inexistente o inactiva', async () => {
    const almacen = memoria(semilla());
    await almacen.db.collection('usuarios').updateOne({ _id: id(3) }, { $set: { passwordHash: await hash('Prueba1234', 12) } });
    const login = crearIniciadorSesion({ conectar: async () => almacen.db });
    const incorrecta = await pedir(login, { email: 'cliente@example.test', contrasena: 'Otra1234' });
    const inexistente = await pedir(login, { email: 'nadie@example.test', contrasena: 'Prueba1234' });
    await almacen.db.collection('usuarios').updateOne({ _id: id(3) }, { $set: { activo: false } });
    const inactiva = await pedir(login, { email: 'cliente@example.test', contrasena: 'Prueba1234' });
    for (const respuesta of [incorrecta, inexistente, inactiva]) { assert.equal(respuesta.estado, 401); assert.deepEqual(respuesta.datos, incorrecta.datos); }
    assert.equal(almacen.documentos('sesiones').length, 0);
});

test('login, registro y clientes comparten la lectura segura de JSON sin perder su límite de 16 KB', async () => {
    const almacen = memoria(semilla());
    const conectar = async () => almacen.db;
    const gestores = [
        crearIniciadorSesion({ conectar }),
        crearRegistrador({ conectar, transaccion: almacen.transaccion }),
        crearGestorClientes({ conectar, transaccion: almacen.transaccion, usuario: async () => usuarioSesion('ADMIN') }),
    ];
    for (const gestor of gestores) {
        assert.equal((await pedir(gestor, '{inválido')).estado, 400);
        assert.equal((await pedir(gestor, [])).estado, 400);
        assert.equal((await pedir(gestor, {}, 'text/plain')).estado, 415);
        assert.equal((await pedir(gestor, 'x'.repeat(16385))).estado, 413);
    }
    assert.equal(almacen.escrituras.length, 0);
});
