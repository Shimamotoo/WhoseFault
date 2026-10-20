import { describe, it, expect } from "vitest";
import {
  Occurrence,
  HTTP_METHODS,
  type HttpMethod,
} from "../../domain/occurrence.js";

describe("SPEC-01: Entidade Occurrence", () => {
  const baseValidProps = {
    apiName: "Pagamentos API",
    url: "https://api.exemplo.com/v1/cobrancas",
    method: "POST" as HttpMethod,
  };

  it("CA-01: deve salvar a ocorrência com título genérico quando for criada sem descrição", () => {
    // Arrange
    const props = {
      ...baseValidProps,
      description: undefined,
    };

    // Act
    const occurrence = Occurrence.create(props);

    // Assert
    expect(occurrence.title).toBe("Ocorrência sem descrição");
    expect(occurrence.description).toBeUndefined();
  });

  it("CA-02: deve rejeitar a criação quando o nome da API estiver ausente ou em branco", () => {
    // Arrange
    const propsMissing = { ...baseValidProps, apiName: "" };
    const propsBlank = { ...baseValidProps, apiName: "   " };

    // Act & Assert
    expect(() => Occurrence.create(propsMissing)).toThrow(Error);
    expect(() => Occurrence.create(propsMissing)).toThrow(
      "Nome da API é obrigatório."
    );
    expect(() => Occurrence.create(propsBlank)).toThrow(
      "Nome da API é obrigatório."
    );
  });

  it("CA-02: deve rejeitar a criação quando a URL estiver ausente ou em branco", () => {
    // Arrange
    const propsMissing = { ...baseValidProps, url: "" };
    const propsBlank = { ...baseValidProps, url: "   " };

    // Act & Assert
    expect(() => Occurrence.create(propsMissing)).toThrow(Error);
    expect(() => Occurrence.create(propsMissing)).toThrow(
      "URL é obrigatória."
    );
    expect(() => Occurrence.create(propsBlank)).toThrow(
      "URL é obrigatória."
    );
  });

  it("CA-02: deve rejeitar a criação quando o método HTTP estiver ausente", () => {
    // Arrange
    const propsMissingMethod = {
      ...baseValidProps,
      method: "" as unknown as HttpMethod,
    };

    // Act & Assert
    expect(() => Occurrence.create(propsMissingMethod)).toThrow(Error);
    expect(() => Occurrence.create(propsMissingMethod)).toThrow(
      "Método HTTP é obrigatório."
    );
  });

  it("CA-03: deve rejeitar a criação quando a URL for inválida ou relativa", () => {
    // Arrange
    const propsMalformed = { ...baseValidProps, url: "not-a-valid-url" };
    const propsRelative = { ...baseValidProps, url: "/v1/cobrancas" };

    // Act & Assert
    expect(() => Occurrence.create(propsMalformed)).toThrow(Error);
    expect(() => Occurrence.create(propsMalformed)).toThrow("URL inválida.");
    expect(() => Occurrence.create(propsRelative)).toThrow("URL inválida.");
  });

  it("CA-03: deve rejeitar a criação quando a URL utilizar protocolo diferente de HTTP ou HTTPS", () => {
    // Arrange
    const propsFtp = {
      ...baseValidProps,
      url: "ftp://api.exemplo.com/v1/cobrancas",
    };
    const propsWs = {
      ...baseValidProps,
      url: "ws://api.exemplo.com/v1/cobrancas",
    };

    // Act & Assert
    expect(() => Occurrence.create(propsFtp)).toThrow(Error);
    expect(() => Occurrence.create(propsFtp)).toThrow(
      "URL deve utilizar o protocolo HTTP ou HTTPS."
    );
    expect(() => Occurrence.create(propsWs)).toThrow(
      "URL deve utilizar o protocolo HTTP ou HTTPS."
    );
  });

  it("CA-03: deve aceitar URLs absolutas utilizando protocolos HTTP e HTTPS", () => {
    // Arrange
    const httpProps = {
      ...baseValidProps,
      url: "http://api.exemplo.com/test",
    };
    const httpsProps = {
      ...baseValidProps,
      url: "https://api.exemplo.com/test",
    };

    // Act
    const httpOccurrence = Occurrence.create(httpProps);
    const httpsOccurrence = Occurrence.create(httpsProps);

    // Assert
    expect(httpOccurrence.url).toBe("http://api.exemplo.com/test");
    expect(httpsOccurrence.url).toBe("https://api.exemplo.com/test");
  });

  it("CA-04: deve rejeitar a criação quando o método HTTP não for permitido", () => {
    // Arrange
    const propsInvalidMethod = {
      ...baseValidProps,
      method: "INVALID" as unknown as HttpMethod,
    };
    const propsConnectMethod = {
      ...baseValidProps,
      method: "CONNECT" as unknown as HttpMethod,
    };

    // Act & Assert
    expect(() => Occurrence.create(propsInvalidMethod)).toThrow(Error);
    expect(() => Occurrence.create(propsInvalidMethod)).toThrow(
      "Método HTTP inválido: INVALID."
    );
    expect(() => Occurrence.create(propsConnectMethod)).toThrow(
      "Método HTTP inválido: CONNECT."
    );
  });

  it("CA-04: deve aceitar todos os métodos HTTP permitidos pela especificação", () => {
    // Arrange & Act & Assert
    for (const method of HTTP_METHODS) {
      const occurrence = Occurrence.create({
        ...baseValidProps,
        method,
      });
      expect(occurrence.method).toBe(method);
    }
  });

  it("CA-07: deve permitir criar ocorrência sem resposta HTTP ou informações técnicas complementares", () => {
    // Arrange
    const minimalProps = {
      apiName: "Serviço de Notificações",
      url: "https://notify.exemplo.com/send",
      method: "POST" as HttpMethod,
    };

    // Act
    const occurrence = Occurrence.create(minimalProps);

    // Assert
    expect(occurrence).toBeDefined();
    expect(occurrence.apiName).toBe("Serviço de Notificações");
    expect(occurrence.url).toBe("https://notify.exemplo.com/send");
    expect(occurrence.method).toBe("POST");
  });

  it("RN-05: deve preservar a descrição original fornecida separada do título", () => {
    // Arrange
    const originalDescription = "Recebendo timeout ao processar webhook de faturamento.";
    const props = {
      ...baseValidProps,
      description: originalDescription,
    };

    // Act
    const occurrence = Occurrence.create(props);

    // Assert
    expect(occurrence.description).toBe(originalDescription);
    expect(occurrence.title).toBe("Ocorrência sem descrição");
  });

  it("RN-01: deve gerar identificador em formato UUID v4 e inicializar datas com o mesmo instante na criação padrão", () => {
    // Arrange & Act
    const occurrence = Occurrence.create(baseValidProps);

    // Assert
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(occurrence.id).toMatch(uuidV4Regex);
    expect(occurrence.createdAt).toBeInstanceOf(Date);
    expect(occurrence.updatedAt).toBeInstanceOf(Date);
    expect(occurrence.createdAt.getTime()).toBe(occurrence.updatedAt.getTime());
  });

  it("RN-01: deve permitir informar um identificador customizado pré-existente", () => {
    // Arrange
    const customId = "ocorrencia-id-custom";

    // Act
    const occurrence = Occurrence.create({
      ...baseValidProps,
      id: customId,
    });

    // Assert
    expect(occurrence.id).toBe(customId);
  });

  it("RN-01: deve fazer updatedAt herdar createdAt quando apenas createdAt for fornecido", () => {
    // Arrange
    const pastDate = new Date("2026-01-15T10:00:00.000Z");

    // Act
    const occurrence = Occurrence.create({
      ...baseValidProps,
      createdAt: pastDate,
    });

    // Assert
    expect(occurrence.createdAt.getTime()).toBe(pastDate.getTime());
    expect(occurrence.updatedAt.getTime()).toBe(pastDate.getTime());
  });

  it("RN-01: deve permitir informar createdAt e updatedAt distintos", () => {
    // Arrange
    const createdAt = new Date("2026-01-15T10:00:00.000Z");
    const updatedAt = new Date("2026-01-16T12:00:00.000Z");

    // Act
    const occurrence = Occurrence.create({
      ...baseValidProps,
      createdAt,
      updatedAt,
    });

    // Assert
    expect(occurrence.createdAt.getTime()).toBe(createdAt.getTime());
    expect(occurrence.updatedAt.getTime()).toBe(updatedAt.getTime());
  });
});
