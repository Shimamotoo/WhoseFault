import { DomainValidationError } from "./errors.js";

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OccurrenceProps {
  id?: string;
  userId?: string | null;
  apiName: string;
  url: string;
  method: HttpMethod;
  description?: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Occurrence {
  readonly id: string;
  readonly userId?: string | null;
  readonly apiName: string;
  readonly url: string;
  readonly method: HttpMethod;
  readonly description?: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    id: string;
    userId?: string | null;
    apiName: string;
    url: string;
    method: HttpMethod;
    description?: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.apiName = props.apiName;
    this.url = props.url;
    this.method = props.method;
    this.description = props.description;
    this.title = props.title;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: OccurrenceProps): Occurrence {
    if (!props.apiName || props.apiName.trim() === "") {
      throw new DomainValidationError("Nome da API é obrigatório.");
    }

    if (!props.url || props.url.trim() === "") {
      throw new DomainValidationError("URL é obrigatória.");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(props.url);
    } catch {
      throw new DomainValidationError("URL inválida.");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new DomainValidationError("URL deve utilizar o protocolo HTTP ou HTTPS.");
    }

    if (!props.method) {
      throw new DomainValidationError("Método HTTP é obrigatório.");
    }

    if (!HTTP_METHODS.includes(props.method)) {
      throw new DomainValidationError(`Método HTTP inválido: ${props.method}.`);
    }

    const now = new Date();
    const id = props.id ?? crypto.randomUUID();
    const title = props.title ?? "Ocorrência sem descrição";
    const createdAt = props.createdAt ?? now;
    const updatedAt = props.updatedAt ?? createdAt;

    return new Occurrence({
      id,
      userId: props.userId ?? null,
      apiName: props.apiName.trim(),
      url: props.url.trim(),
      method: props.method,
      description: props.description,
      title,
      createdAt,
      updatedAt,
    });
  }
}
