begin;

/**
 * Acervo dos anexos do WhatsApp ate 50 MB (porte de 18/11/2026).
 *
 * No sistema do Dr. Marcello, em 09/11/2026, um raio-x em PDF de 29,4 MB foi
 * recusado duas vezes pelo limite de 20 MB desta pasta: a Central mostrava so
 * o nome do arquivo e ninguem conseguia abrir. A migration 20260924000800
 * dizia que 20 MB era o limite da Meta para midia recebida; nao e - documento
 * no WhatsApp vai ate 100 MB. Aqui o risco e o mesmo: laudo de tomografia,
 * ressonancia ou densitometria em PDF, que a filha ou o cuidador manda antes
 * da consulta, passa de 20 MB com facilidade.
 *
 * 50 MB e o teto de arquivo do Supabase no plano gratuito; acima disso o
 * upload seria recusado de qualquer jeito, pelo limite geral do projeto
 * (Storage > Settings no painel), que nao se muda por migration. O mesmo
 * numero esta em LIMITE_DO_ACERVO
 * (supabase/functions/_shared/acervo-do-anexo.ts): mudou aqui, muda la.
 *
 * So o tamanho muda. A lista de tipos aceitos e as policies ficam como estao.
 */
update storage.buckets
   set file_size_limit = 52428800
 where id = 'whatsapp-anexos';

commit;
